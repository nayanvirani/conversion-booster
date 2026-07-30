import type { SessionStorage } from "@shopify/shopify-api";
import { Session } from "@shopify/shopify-api";
import { getPool } from "./db.server";

const TABLE = "shopify_sessions";

async function ensureTable(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id          VARCHAR(255) NOT NULL PRIMARY KEY,
      shop        VARCHAR(255) NOT NULL,
      state       VARCHAR(255) NOT NULL,
      "isOnline"  BOOLEAN NOT NULL DEFAULT FALSE,
      scope       VARCHAR(1024),
      expires     TIMESTAMPTZ,
      "accessToken" VARCHAR(255),
      "onlineAccessInfo" TEXT
    )
  `);
}

let ready = false;

export class PostgreSQLSessionStorage implements SessionStorage {
  async storeSession(session: Session): Promise<boolean> {
    if (!ready) { await ensureTable(); ready = true; }
    const pool = getPool();
    await pool.query(
      `INSERT INTO ${TABLE} (id, shop, state, "isOnline", scope, expires, "accessToken", "onlineAccessInfo")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         shop = EXCLUDED.shop,
         state = EXCLUDED.state,
         "isOnline" = EXCLUDED."isOnline",
         scope = EXCLUDED.scope,
         expires = EXCLUDED.expires,
         "accessToken" = EXCLUDED."accessToken",
         "onlineAccessInfo" = EXCLUDED."onlineAccessInfo"`,
      [
        session.id,
        session.shop,
        session.state,
        session.isOnline,
        session.scope ?? null,
        session.expires ?? null,
        session.accessToken ?? null,
        session.onlineAccessInfo ? JSON.stringify(session.onlineAccessInfo) : null,
      ]
    );
    return true;
  }

  async loadSession(id: string): Promise<Session | undefined> {
    if (!ready) { await ensureTable(); ready = true; }
    const pool = getPool();
    const result = await pool.query(`SELECT * FROM ${TABLE} WHERE id = $1`, [id]);
    if (result.rows.length === 0) return undefined;
    const row = result.rows[0];
    const session = new Session({
      id: row.id,
      shop: row.shop,
      state: row.state,
      isOnline: row.isOnline,
    });
    if (row.scope) session.scope = row.scope;
    if (row.expires) session.expires = new Date(row.expires);
    if (row.accessToken) session.accessToken = row.accessToken;
    if (row.onlineAccessInfo) {
      try { session.onlineAccessInfo = JSON.parse(row.onlineAccessInfo); } catch {}
    }
    return session;
  }

  async deleteSession(id: string): Promise<boolean> {
    if (!ready) { await ensureTable(); ready = true; }
    const pool = getPool();
    await pool.query(`DELETE FROM ${TABLE} WHERE id = $1`, [id]);
    return true;
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    if (!ready) { await ensureTable(); ready = true; }
    if (ids.length === 0) return true;
    const pool = getPool();
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
    await pool.query(`DELETE FROM ${TABLE} WHERE id IN (${placeholders})`, ids);
    return true;
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    if (!ready) { await ensureTable(); ready = true; }
    const pool = getPool();
    const result = await pool.query(
      `SELECT * FROM ${TABLE} WHERE shop = $1`,
      [shop]
    );
    return result.rows.map((row) => {
      const session = new Session({ id: row.id, shop: row.shop, state: row.state, isOnline: row.isOnline });
      if (row.scope) session.scope = row.scope;
      if (row.expires) session.expires = new Date(row.expires);
      if (row.accessToken) session.accessToken = row.accessToken;
      return session;
    });
  }
}
