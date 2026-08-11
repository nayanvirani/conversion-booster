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
import { authenticate } from "../shopify.server";
import { getShopPlan, setShopPlan } from "../db.server";

// Shopify App Pricing (Managed Pricing) — billing.request() is blocked.
//
// Navigation to the pricing page uses window.shopify.redirectTo(url) — the
// App Bridge v4 postMessage API for top-frame navigation.
//
// After plan selection, Shopify redirects with ?plan_handle=<handle>.
// The home page loader forwards all such visits here so plan changes are
// handled in one place and the plan_handle is always persisted to SQLite.
//
// We use the persisted plan_handle (SQLite) as the single source of truth.
// billing.check() / activeSubscriptions are NOT used because:
//   - billing.check() keeps returning hasActivePayment=true until the billing
//     period ends even after the merchant switches to Free.
//   - activeSubscriptions filters by plan name which may not match exactly.
// The plan_handle Shopify sends is immediate, accurate, and plan-agnostic.

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const planHandleParam = url.searchParams.get("plan_handle");
  const justUpgraded = planHandleParam !== null;

  // When Shopify redirects back after plan selection, persist the plan_handle.
  // This is the only reliable signal of which plan the merchant is now on.
  if (planHandleParam) {
    await setShopPlan(session.shop, planHandleParam);
    console.log(`[billing] Stored plan_handle="${planHandleParam}" for ${session.shop}`);
  }

  // Read the stored plan. If no record exists yet (fresh install before any
  // plan selection), the merchant is on the Free plan by default.
  const storedPlan = await getShopPlan(session.shop);
  const isPro = storedPlan?.toLowerCase() === "pro";

  console.log(`[billing] isPro=${isPro} (storedPlan="${storedPlan}", plan_handle="${planHandleParam}")`);

  // Build the pricing URL server-side.
  const shopName = session.shop.replace(".myshopify.com", "");
  const appHandle = process.env.SHOPIFY_APP_HANDLE || "conversion-booster-11";
  const pricingUrl = `https://admin.shopify.com/store/${shopName}/charges/${appHandle}/pricing_plans`;

  return json({ isPro, justUpgraded, pricingUrl });
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
        <Banner tone="info" title="Switched to Free">
          <p>You're now on the Free plan. You can upgrade again any time.</p>
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
