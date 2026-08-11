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
    // Ensure our table exists and has the pro_granted_at column.
    // ALTER TABLE is a no-op if the column already exists (we wrap in a try).
    _db.serialize(() => {
      _db!.run(`
        CREATE TABLE IF NOT EXISTS shop_plans (
          shop            TEXT PRIMARY KEY,
          plan_handle     TEXT NOT NULL,
          pro_granted_at  INTEGER,
          updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      // Migration: add pro_granted_at if the table predates this column.
      _db!.run(
        `ALTER TABLE shop_plans ADD COLUMN pro_granted_at INTEGER`,
        () => {} // ignore "duplicate column" error — that's fine
      );
    });
  }
  return _db;
}

/** Return the stored plan handle for a shop, or null if unknown. */
export function getShopPlan(shop: string): Promise<string | null> {
  return new Promise((resolve) => {
    db().get(
      "SELECT plan_handle FROM shop_plans WHERE shop = ?",
      [shop],
      (err, row: { plan_handle: string } | undefined) => {
        if (err) {
          console.error("[db] getShopPlan error:", err);
          resolve(null);
        } else {
          resolve(row?.plan_handle ?? null);
        }
      }
    );
  });
}

/**
 * Return the Unix timestamp (seconds) when Pro was last granted via
 * plan_handle=pro redirect, or null if never.
 */
export function getProGrantedAt(shop: string): Promise<number | null> {
  return new Promise((resolve) => {
    db().get(
      "SELECT pro_granted_at FROM shop_plans WHERE shop = ?",
      [shop],
      (err, row: { pro_granted_at: number | null } | undefined) => {
        if (err) { resolve(null); return; }
        resolve(row?.pro_granted_at ?? null);
      }
    );
  });
}

/** Persist (or update) the plan handle for a shop. */
export function setShopPlan(shop: string, planHandle: string): Promise<void> {
  return new Promise((resolve) => {
    db().run(
      `INSERT INTO shop_plans (shop, plan_handle, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(shop) DO UPDATE
         SET plan_handle = excluded.plan_handle,
             updated_at  = datetime('now')`,
      [shop, planHandle],
      (err) => {
        if (err) console.error("[db] setShopPlan error:", err);
        resolve();
      }
    );
  });
}

/**
 * Record the time (Unix seconds) when Pro was confirmed via plan_handle=pro.
 * Used to distinguish a freshly-granted Pro subscription from a stale test one.
 */
export function recordProGrant(shop: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  return new Promise((resolve) => {
    db().run(
      `INSERT INTO shop_plans (shop, plan_handle, pro_granted_at, updated_at)
       VALUES (?, 'pro', ?, datetime('now'))
       ON CONFLICT(shop) DO UPDATE
         SET plan_handle    = 'pro',
             pro_granted_at = ?,
             updated_at     = datetime('now')`,
      [shop, now, now],
      (err) => {
        if (err) console.error("[db] recordProGrant error:", err);
        resolve();
      }
    );
  });
}

/** Clear the stored plan (e.g. on uninstall). */
export function clearShopPlan(shop: string): Promise<void> {
  return new Promise((resolve) => {
    db().run("DELETE FROM shop_plans WHERE shop = ?", [shop], () => resolve());
  });
}
