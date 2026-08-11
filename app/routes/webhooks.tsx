import type { ActionFunctionArgs } from "@remix-run/node";
import sqlite3 from "sqlite3";
import { join } from "path";
import { authenticate } from "../shopify.server";
import { setShopPlan } from "../db.server";
import { updatePlanMetafield } from "../plan.server";

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
  const { topic, shop, payload, admin } = await authenticate.webhook(request);

  switch (topic) {
    case "APP_UNINSTALLED":
      await deleteShopSessions(shop);
      break;

    case "APP_SUBSCRIPTIONS_UPDATE": {
      // Shopify fires this whenever an app subscription is created, updated,
      // or cancelled. Use it to keep SQLite and the plan metafield in sync
      // even when the plan changes outside the embedded app (e.g. Shopify admin).
      const data = payload as { app_subscription?: { status?: string } };
      const status = data?.app_subscription?.status ?? "";
      const isPro = ["ACTIVE", "TRIALING"].includes(status);

      console.log(`[webhook] APP_SUBSCRIPTIONS_UPDATE shop=${shop} status=${status} isPro=${isPro}`);

      await setShopPlan(shop, isPro ? "pro" : "free");

      // Also update the plan metafield so Liquid theme extensions gate correctly.
      if (admin) {
        try {
          const resp = await admin.graphql(`{ currentAppInstallation { id } }`);
          const d = await resp.json();
          const id = d.data?.currentAppInstallation?.id ?? "";
          if (id) await updatePlanMetafield(admin, id, isPro);
        } catch (err) {
          console.warn("[webhook] metafield update failed (non-critical):", err);
        }
      }
      break;
    }

    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
      // This app stores no customer PII — widget settings live in the merchant's theme.
      break;

    case "SHOP_REDACT":
      await deleteShopSessions(shop);
      break;

    default:
      return new Response("Unhandled webhook topic", { status: 404 });
  }

  return new Response(null, { status: 200 });
};
