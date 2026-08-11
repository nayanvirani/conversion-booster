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

// Plan status strategy — single source of truth: Shopify's activeSubscriptions API.
//
// On every page load:
//   1. Call activeSubscriptions — ACTIVE or TRIALING = Pro.
//   2. plan_handle=free from Shopify's redirect is an explicit downgrade signal
//      (handles billing-period lag on production stores).
//   3. Write the result back to SQLite so the home page can read it without
//      an extra GraphQL round-trip. SQLite is a write-through cache, never
//      the authoritative source.
//
// If the API call fails: fall back to the cached SQLite value.

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const planHandleParam = url.searchParams.get("plan_handle");
  const justChangedPlan = planHandleParam !== null;

  const shopName = session.shop.replace(".myshopify.com", "");
  const appHandle = process.env.SHOPIFY_APP_HANDLE || "conversion-booster-11";
  const pricingUrl = `https://admin.shopify.com/store/${shopName}/charges/${appHandle}/pricing_plans`;

  try {
    const response = await admin.graphql(`
      #graphql
      query GetPlanStatus {
        currentAppInstallation {
          activeSubscriptions { id status }
        }
      }
    `);
    const data = await response.json();
    const subs: Array<{ id: string; status: string }> =
      data.data?.currentAppInstallation?.activeSubscriptions ?? [];

    // API is the source of truth.
    // ACTIVE or TRIALING subscription = Pro.
    const isProFromAPI = subs.some((s) =>
      ["ACTIVE", "TRIALING"].includes(s.status)
    );

    // plan_handle=free from Shopify's redirect is a reliable explicit downgrade
    // signal — honour it even if the API still shows an active subscription
    // (billing period lag). plan_handle=pro is NOT sufficient to grant Pro;
    // the API must confirm.
    const isPro = planHandleParam === "free" ? false : isProFromAPI;

    // Always write the current truth back to SQLite so the home page
    // loader can use it without an extra API call.
    await setShopPlan(session.shop, isPro ? "pro" : "free");

    console.log(
      `[billing] subs=${subs.length} plan_handle="${planHandleParam}" → isPro=${isPro} (stored)`
    );

    return json({ isPro, justChangedPlan, pricingUrl });
  } catch (err) {
    // API failed — fall back to the last known value from SQLite.
    console.error("[billing] GraphQL failed, using cached plan:", err);
    const storedPlan = await getShopPlan(session.shop);
    const isPro = storedPlan?.toLowerCase() === "pro";
    return json({ isPro, justChangedPlan, pricingUrl });
  }
};

export default function BillingPage() {
  const { isPro, justChangedPlan, pricingUrl } = useLoaderData<typeof loader>();

  const goToPricingPage = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shopify = (window as any).shopify;
    if (shopify?.redirectTo) {
      shopify.redirectTo(pricingUrl);
    } else {
      window.open(pricingUrl, "_top");
    }
  };

  return (
    <Page title="Plans" backAction={{ content: "Home", url: "/app" }}>
      {justChangedPlan && isPro && (
        <Banner tone="success" title="Welcome to Pro!">
          <p>Your Pro subscription is now active. Enjoy all Pro features.</p>
        </Banner>
      )}
      {justChangedPlan && !isPro && (
        <Banner tone="info" title="Switched to Free">
          <p>You're now on the Free plan. You can upgrade again any time.</p>
        </Banner>
      )}
      <Layout>
        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingLg">Free Plan</Text>
                <Text as="p" variant="headingLg" tone="subdued">$0 / month</Text>
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
                <Text as="h2" variant="headingLg">Pro Plan</Text>
                <Text as="p" variant="headingLg">$9.99 / month</Text>
              </InlineStack>
              {isPro ? (
                <Badge tone="success">Active subscription</Badge>
              ) : (
                <Badge tone="info">7-day free trial included</Badge>
              )}
              <Divider />
              <Text as="p" variant="bodyMd" tone="subdued">Everything in Free, plus:</Text>
              <List>
                <List.Item>Sticky Add to Cart</List.Item>
                <List.Item>Social Proof Popup</List.Item>
                <List.Item>No "Powered by" branding</List.Item>
                <List.Item>Priority email support</List.Item>
                <List.Item>All future widgets</List.Item>
              </List>
              {!isPro ? (
                <Button variant="primary" size="large" onClick={goToPricingPage}>
                  Start 7-day free trial
                </Button>
              ) : (
                <Button variant="plain" tone="critical" onClick={goToPricingPage}>
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
