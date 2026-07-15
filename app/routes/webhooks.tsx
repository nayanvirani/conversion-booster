import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, session } = await authenticate.webhook(request);

  switch (topic) {
    case "APP_UNINSTALLED":
      // Session is automatically cleaned up by SQLiteSessionStorage
      // when the shop uninstalls. No extra work needed for this MVP.
      break;

    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
      // This app stores no customer PII on its own servers.
      // All widget settings live in the merchant's theme — Shopify owns that data.
      break;

    case "SHOP_REDACT":
      // All data for this shop lives in the SQLite session file.
      // The session is removed by the APP_UNINSTALLED webhook above.
      break;

    default:
      return new Response("Unhandled webhook topic", { status: 404 });
  }

  return new Response(null, { status: 200 });
};
