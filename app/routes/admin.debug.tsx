import { json, type LoaderFunctionArgs } from "@remix-run/node";
import sqlite3 from "sqlite3";
import { join } from "path";

// Auth handled by Express Basic Auth middleware (same as /admin)
export async function loader({ request: _ }: LoaderFunctionArgs) {
  const dbPath = process.env.DATABASE_PATH || join(process.cwd(), "database.sqlite");

  const rows = await new Promise<any[]>((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) return reject(err);
    });
    db.all(
      `SELECT id, shop, isOnline, expires, scope,
              accessToken IS NOT NULL as hasAccessToken,
              CASE WHEN accessToken IS NOT NULL THEN substr(accessToken,1,8) || '...' ELSE NULL END as tokenPreview,
              refreshToken IS NOT NULL as hasRefreshToken,
              refreshTokenExpires,
              length(accessToken) as tokenLen
       FROM shopify_sessions
       ORDER BY shop, isOnline`,
      [],
      (err, rows) => {
        db.close();
        if (err) reject(err);
        else resolve(rows as any[]);
      }
    );
  });

  const dbInfo = await new Promise<any>((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) return reject(err);
    });
    db.all(`PRAGMA table_info(shopify_sessions)`, [], (err, cols) => {
      db.close();
      if (err) reject(err);
      else resolve({ dbPath, columns: (cols as any[]).map((c: any) => c.name) });
    });
  });

  return json({ dbInfo, sessions: rows, now: Math.floor(Date.now() / 1000) });
}
