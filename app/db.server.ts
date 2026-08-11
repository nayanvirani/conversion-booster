// Thin SQLite wrapper for storing shop-level data that goes beyond what
// @shopify/shopify-app-session-storage-sqlite manages (Shopify sessions only).
//
// Uses the same database file as the session storage so there's a single
// SQLite file on the Railway volume.

import sqlite3 from "sqlite3";
import { join } from "path";

const DB_PATH =
  process.env.DATABASE_PATH || join(process.cwd(), "database.sqlite");

// Singleton connection — safe in single-process Node server.
let _db: sqlite3.Database | null = null;

function db(): sqlite3.Database {
  if (!_db) {
    _db = new sqlite3.Database(DB_PATH);
    // Ensure our tables exist.  UPSERT (ON CONFLICT DO UPDATE) requires
    // SQLite ≥ 3.24, which ships with Node 20 on Railway.
    _db.run(`
      CREATE TABLE IF NOT EXISTS shop_plans (
        shop        TEXT PRIMARY KEY,
        plan_handle TEXT NOT NULL,
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }
  return _db;
}

/** Return the stored plan handle for a shop, or null if unknown. */
export function getShopPlan(shop: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    db().get(
      "SELECT plan_handle FROM shop_plans WHERE shop = ?",
      [shop],
      (err, row: { plan_handle: string } | undefined) => {
        if (err) {
          console.error("[db] getShopPlan error:", err);
          resolve(null); // non-fatal — fall back gracefully
        } else {
          resolve(row?.plan_handle ?? null);
        }
      }
    );
  });
}

/** Persist (or update) the plan handle for a shop. */
export function setShopPlan(shop: string, planHandle: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db().run(
      `INSERT INTO shop_plans (shop, plan_handle, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(shop) DO UPDATE
         SET plan_handle = excluded.plan_handle,
             updated_at  = datetime('now')`,
      [shop, planHandle],
      (err) => {
        if (err) {
          console.error("[db] setShopPlan error:", err);
          resolve(); // non-fatal
        } else {
          resolve();
        }
      }
    );
  });
}

/** Clear the stored plan (e.g. on uninstall or downgrade). */
export function clearShopPlan(shop: string): Promise<void> {
  return new Promise((resolve) => {
    db().run("DELETE FROM shop_plans WHERE shop = ?", [shop], () => resolve());
  });
}
