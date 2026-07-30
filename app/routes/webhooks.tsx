import type { ActionFunctionArgs } from "@remix-run/node";
import sqlite3 from "sqlite3";
import { join } from "path";
import { authenticate } from "../shopify.server";

function deleteShopSessions(shop: string): Promise<void> {
  return new Promise((resolve) => {
    const dbPath = process.env.DATABASE_PATH || join(process.cwd(), "database.sqlite");
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) return resolve();
    });
    db.run(
      "DELETE FROM shopify_sessions WHERE shop = ?",
      [shop],
      () => { db.close(); resolve(); }
    );
  });
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);

  switch (topic) {
    case "APP_UNINSTALLED":
      await deleteShopSessions(shop);
      break;

    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
      // This app stores no customer PII — widget settings live in the merchant's theme.
      break;

    case "SHOP_REDACT":
      // Delete all sessions for this shop from our database.
      await deleteShopSessions(shop);
      break;

    default:
      return new Response("Unhandled webhook topic", { status: 404 });
  }

  return new Response(null, { status: 200 });
};
