import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  DeliveryMethod,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";

const LATEST_API_VERSION = ApiVersion.July26;
import { SQLiteSessionStorage } from "@shopify/shopify-app-session-storage-sqlite";
import { join } from "path";

export const PLANS = {
  PRO: "Pro Plan",
} as const;

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: LATEST_API_VERSION,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new SQLiteSessionStorage(
    process.env.DATABASE_PATH || join(process.cwd(), "database.sqlite")
  ),
  distribution: AppDistribution.AppStore,
  // No billing config — this app uses Shopify Managed Pricing.
  // Pricing is defined in the Partner Dashboard; billing.request() is blocked.
  // Use billing.check() to read current subscription status.
  webhooks: {
    APP_UNINSTALLED: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
    // GDPR topics (CUSTOMERS_DATA_REQUEST, CUSTOMERS_REDACT, SHOP_REDACT) are
    // configured via [webhooks.privacy_compliance] in shopify.app.toml and
    // cannot be registered via the GraphQL API — Shopify returns 403 if tried.
  },
  hooks: {
    afterAuth: async ({ session }) => {
      try {
        await shopify.registerWebhooks({ session });
      } catch (err: any) {
        // 403 is expected on dev stores and when Shopify restricts webhook API access.
        // Log it but never let it crash the process.
        console.warn("[webhooks] registerWebhooks failed (non-fatal):", err?.message ?? err);
      }
    },
  },
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    expiringOfflineAccessTokens: true,
  },
});

export default shopify;
export const apiVersion = LATEST_API_VERSION;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
