import sqlite3 from "sqlite3";
import { join } from "path";

export type ShopRow = {
  id: string;
  shop: string;
  isOnline: number;
  expires: number | null;
  scope: string | null;
  accessToken: string | null;
};

export type EnrichedShop = ShopRow & {
  storeName: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  isPro: boolean;
  planName: string;
  trialActive: boolean;
  apiError: boolean;
};

export function getShops(): Promise<ShopRow[]> {
  return new Promise((resolve, reject) => {
    const dbPath =
      process.env.DATABASE_PATH || join(process.cwd(), "database.sqlite");
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) return reject(new Error(`Cannot open DB at ${dbPath}: ${err.message}`));
    });
    db.all(
      `SELECT id, shop, isOnline, expires, scope, accessToken
       FROM shopify_sessions
       WHERE isOnline = 0
       ORDER BY shop ASC`,
      [],
      (err, rows) => {
        db.close();
        if (err) reject(err);
        else resolve(rows as ShopRow[]);
      }
    );
  });
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  const timeout = new Promise<null>((res) => setTimeout(() => res(null), ms));
  return Promise.race([promise, timeout]);
}

async function fetchShopInfo(
  shop: string,
  accessToken: string
): Promise<{ storeName: string; ownerName: string; ownerEmail: string } | null> {
  try {
    const res = await withTimeout(
      fetch(`https://${shop}/admin/api/2025-10/shop.json`, {
        headers: { "X-Shopify-Access-Token": accessToken },
      }),
      6000
    );
    if (!res || !res.ok) return null;
    const data: any = await res.json();
    return {
      storeName: data.shop?.name ?? shop,
      ownerName: data.shop?.shop_owner ?? "",
      ownerEmail: data.shop?.email ?? "",
    };
  } catch {
    return null;
  }
}

async function fetchBillingStatus(
  shop: string,
  accessToken: string
): Promise<{ isPro: boolean; planName: string; trialActive: boolean } | null> {
  try {
    const query = `{ currentAppInstallation { activeSubscriptions { name status trialDays } } }`;
    const res = await withTimeout(
      fetch(`https://${shop}/admin/api/2025-10/graphql.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({ query }),
      }),
      6000
    );
    if (!res || !res.ok) return null;
    const data: any = await res.json();
    const subs: any[] = data.data?.currentAppInstallation?.activeSubscriptions ?? [];
    const active = subs[0];
    return {
      isPro: subs.length > 0,
      planName: active?.name ?? "Free",
      trialActive: active?.status === "ACTIVE" && (active?.trialDays ?? 0) > 0,
    };
  } catch {
    return null;
  }
}

export async function getEnrichedShops(): Promise<EnrichedShop[]> {
  const shops = await getShops();

  return Promise.all(
    shops.map(async (shop) => {
      if (!shop.accessToken) {
        return {
          ...shop,
          storeName: null,
          ownerName: null,
          ownerEmail: null,
          isPro: false,
          planName: "Free",
          trialActive: false,
          apiError: false,
        };
      }

      const [info, billing] = await Promise.all([
        fetchShopInfo(shop.shop, shop.accessToken),
        fetchBillingStatus(shop.shop, shop.accessToken),
      ]);

      return {
        ...shop,
        storeName: info?.storeName ?? null,
        ownerName: info?.ownerName ?? null,
        ownerEmail: info?.ownerEmail ?? null,
        isPro: billing?.isPro ?? false,
        planName: billing?.planName ?? "Free",
        trialActive: billing?.trialActive ?? false,
        apiError: info === null && billing === null,
      };
    })
  );
}

export function shopsToCSV(shops: ShopRow[]): string {
  const header = "Shop Domain,Session ID,Scopes,Expires,Has Token";
  const rows = shops.map((s) => {
    const expires = s.expires
      ? new Date(s.expires * 1000).toISOString()
      : "never";
    const scopes = `"${(s.scope || "").replace(/"/g, '""')}"`;
    const hasToken = s.accessToken ? "yes" : "no";
    return `${s.shop},${s.id},${scopes},${expires},${hasToken}`;
  });
  return [header, ...rows].join("\n");
}

export function enrichedShopsToCSV(shops: EnrichedShop[]): string {
  const header = "Shop Domain,Store Name,Owner Name,Owner Email,Plan,Session ID,Scopes,Expires,Has Token";
  const rows = shops.map((s) => {
    const expires = s.expires
      ? new Date(s.expires * 1000).toISOString()
      : "never";
    const scopes = `"${(s.scope || "").replace(/"/g, '""')}"`;
    const hasToken = s.accessToken ? "yes" : "no";
    const quote = (v: string | null) => `"${(v ?? "").replace(/"/g, '""')}"`;
    return [
      s.shop, quote(s.storeName), quote(s.ownerName), quote(s.ownerEmail),
      s.isPro ? "Pro" : "Free",
      s.id, scopes, expires, hasToken,
    ].join(",");
  });
  return [header, ...rows].join("\n");
}
