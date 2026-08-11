import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  Divider,
  InlineStack,
  Layout,
  List,
  Page,
  Text,
} from "@shopify/polaris";
import { authenticate, PLANS } from "../shopify.server";
import { getShopPlan, setShopPlan } from "../db.server";

// Shopify App Pricing (Managed Pricing) — billing.request() is blocked.
//
// Navigation to the pricing page must use window.shopify.redirectTo(url),
// which is the App Bridge v4 API for top-frame navigation. It works via
// postMessage to the parent Shopify admin frame — no user-gesture restriction,
// no sandbox permission issue. This is the same mechanism used internally by
// @shopify/shopify-app-remix's respondToExitIframeRequest().
//
// window.open(url, "_top") was tried first but App Bridge intercepts it and
// the navigation was silently redirected to settings/apps.
//
// After plan selection, Shopify App Pricing redirects to the per-plan
// "Welcome link" configured in Partner Dashboard. Set it to a relative
// path like /billing so merchants land back on this page with ?plan_handle=<plan>.
//
// IMPORTANT: currentAppInstallation.activeSubscriptions only returns subscriptions
// from the Shopify Billing API (billing.request()). Shopify App Pricing (Managed
// Pricing) subscriptions are NOT returned there — you need the Partner API for that.
// As a reliable alternative, we persist the plan_handle in SQLite when Shopify
// sends it as a redirect URL param after plan selection.

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const url = new URL(request.url);
  // Shopify App Pricing sends ?plan_handle=<handle> after plan selection
  // (not charge_id — that's from the old Billing API).
  const planHandleParam = url.searchParams.get("plan_handle");
  const justUpgraded = planHandleParam !== null;

  // Build the pricing URL server-side.
  const shopName = session.shop.replace(".myshopify.com", "");

  // Shopify's pricing_plans URL uses the APP HANDLE visible in:
  //   admin.shopify.com/store/{shop}/apps/conversion-booster-11
  // NOT the API key / client ID.
  const appHandle = process.env.SHOPIFY_APP_HANDLE || "conversion-booster-11";
  const pricingUrl = `https://admin.shopify.com/store/${shopName}/charges/${appHandle}/pricing_plans`;

  // If Shopify just redirected back with ?plan_handle=pro, persist it so future
  // loads (without the param) also reflect the correct plan.
  if (planHandleParam) {
    await setShopPlan(session.shop, planHandleParam);
    console.log(`[billing] Stored plan_handle="${planHandleParam}" for ${session.shop}`);
  }

  // Read the persisted plan (set above or from a previous session).
  const storedPlanHandle = await getShopPlan(session.shop);
  console.log(`[billing] storedPlanHandle="${storedPlanHandle}" for ${session.shop}`);

  try {
    const response = await admin.graphql(`
      #graphql
      query GetAppSubscription {
        currentAppInstallation {
          activeSubscriptions {
            id
            name
            status
            trialDays
          }
        }
      }
    `);
    const data = await response.json();
    const activeSubscriptions: Array<{
      id: string;
      name: string;
      status: string;
      trialDays: number;
    }> = data.data?.currentAppInstallation?.activeSubscriptions ?? [];

    console.log("[billing] activeSubscriptions:", JSON.stringify(activeSubscriptions));

    // isPro: check Admin GraphQL (works if the shop has a Billing API subscription)
    // OR trust the persisted plan_handle from Shopify App Pricing redirect.
    const isProFromGraphQL = activeSubscriptions.some(
      (sub) =>
        sub.name === PLANS.PRO &&
        ["ACTIVE", "TRIALING"].includes(sub.status)
    );
    const isProFromStoredPlan = storedPlanHandle?.toLowerCase() === "pro";
    const isPro = isProFromGraphQL || isProFromStoredPlan;

    console.log(`[billing] isPro=${isPro} (graphql=${isProFromGraphQL}, stored=${isProFromStoredPlan})`);

    return json({ isPro, subscriptions: activeSubscriptions, justUpgraded, pricingUrl });
  } catch (err) {
    console.error("[billing] Failed to query subscription status:", err);
    // Still use stored plan as fallback even if GraphQL fails.
    const isPro = storedPlanHandle?.toLowerCase() === "pro";
    return json({ isPro, subscriptions: [], justUpgraded, pricingUrl });
  }
};

export default function BillingPage() {
  const { isPro, justUpgraded, pricingUrl } = useLoaderData<typeof loader>();

  const goToPricingPage = () => {
    // App Bridge v4 exposes window.shopify.redirectTo() which uses postMessage
    // to navigate the parent Shopify admin frame. This is the correct method
    // for embedded apps — it does not require a user gesture and is not
    // intercepted/blocked unlike window.open(url, "_top").
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shopify = (window as any).shopify;
    if (shopify?.redirectTo) {
      shopify.redirectTo(pricingUrl);
    } else {
      // Fallback for non-embedded / testing contexts
      window.open(pricingUrl, "_top");
    }
  };

  return (
    <Page
      title="Plans"
      backAction={{ content: "Home", url: "/app" }}
    >
      {justUpgraded && isPro && (
        <Banner tone="success" title="Welcome to Pro!">
          <p>Your Pro subscription is now active. Enjoy all Pro features.</p>
        </Banner>
      )}
      {justUpgraded && !isPro && (
        <Banner tone="info" title="Plan selected">
          <p>Your subscription is being processed. Refresh in a moment to see your updated plan.</p>
        </Banner>
      )}
      <Layout>
        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingLg">
                  Free Plan
                </Text>
                <Text as="p" variant="headingLg" tone="subdued">
                  $0 / month
                </Text>
              </InlineStack>
              {!isPro && <Badge tone="success">Current plan</Badge>}
              <Divider />
              <List>
                <List.Item>Announcement Bar</List.Item>
                <List.Item>Trust Badges</List.Item>
                <List.Item>Countdown Timer</List.Item>
                <List.Item>"Powered by Boostify" branding</List.Item>
              </List>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingLg">
                  Pro Plan
                </Text>
                <Text as="p" variant="headingLg">
                  $9.99 / month
                </Text>
              </InlineStack>
              {isPro ? (
                <Badge tone="success">Active subscription</Badge>
              ) : (
                <Badge tone="info">7-day free trial included</Badge>
              )}
              <Divider />
              <Text as="p" variant="bodyMd" tone="subdued">
                Everything in Free, plus:
              </Text>
              <List>
                <List.Item>Sticky Add to Cart</List.Item>
                <List.Item>Social Proof Popup</List.Item>
                <List.Item>No "Powered by" branding</List.Item>
                <List.Item>Priority email support</List.Item>
                <List.Item>All future widgets</List.Item>
              </List>
              {!isPro ? (
                <Button
                  variant="primary"
                  size="large"
                  onClick={goToPricingPage}
                >
                  Start 7-day free trial
                </Button>
              ) : (
                <Button
                  variant="plain"
                  tone="critical"
                  onClick={goToPricingPage}
                >
                  Manage subscription
                </Button>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
