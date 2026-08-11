import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  DeliveryMethod,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";

const LATEST_API_VERSION = ApiVersion.July26;
import { SQLiteSessionStorage } from "@shopify/shopify-app-session-storage-sqlite";
import { join } from "path";

// Plan handle as defined in the Shopify Partner Dashboard.
// Used for billing.check() on dev stores (activeSubscriptions excludes test subscriptions).
export const PLANS = {
  PRO: "PRO",
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
  // Billing config enables billing.check() so we can verify plan status.
  // billing.request() is still handled by Shopify Managed Pricing (Partner Dashboard).
  // The amount/interval here are metadata only — Shopify ignores them for managed pricing.
  billing: {
    [PLANS.PRO]: {
      lineItems: [
        {
          amount: 9.99,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
  },
  webhooks: {
    APP_UNINSTALLED: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
    APP_SUBSCRIPTIONS_UPDATE: {
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
