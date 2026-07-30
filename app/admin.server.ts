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
