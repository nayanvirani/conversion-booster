import { query } from "./db.server";

export type ShopRow = {
  id: string;
  shop: string;
  isOnline: boolean;
  expires: string | null;
  scope: string | null;
  accessToken: string | null;
};

export async function getShops(): Promise<ShopRow[]> {
  return query<ShopRow>(
    `SELECT id, shop, "isOnline", expires, scope, "accessToken"
     FROM shopify_sessions
     WHERE "isOnline" = false
     ORDER BY shop ASC`
  );
}

export function shopsToCSV(shops: ShopRow[]): string {
  const header = "Shop Domain,Session ID,Scopes,Expires,Has Token";
  const rows = shops.map((s) => {
    const expires = s.expires
      ? new Date(s.expires).toISOString()
      : "never";
    const scopes = `"${(s.scope || "").replace(/"/g, '""')}"`;
    const hasToken = s.accessToken ? "yes" : "no";
    return `${s.shop},${s.id},${scopes},${expires},${hasToken}`;
  });
  return [header, ...rows].join("\n");
}
