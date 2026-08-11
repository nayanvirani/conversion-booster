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
import { PLANS } from "../shopify.server";
import { getShopPlan, setShopPlan } from "../db.server";

// Plan detection strategy:
//
// PRODUCTION stores  → activeSubscriptions is authoritative (real paid subscriptions
//                      always appear here). Write to SQLite on every load.
//
// DEV stores         → activeSubscriptions NEVER includes test subscriptions (Shopify
//                      platform restriction). Two complementary signals instead:
//
//   1. plan_handle from Shopify's redirect (fires after any plan selection).
//      Writes directly to SQLite. Highest priority.
//
//   2. billing.check({ isTest: true }) on every load — designed specifically to
//      detect test subscriptions. If it says no active payment → Free, even if
//      SQLite says Pro (handles the stale-Pro case when downgrading).
//
//   plan_handle=free from a redirect always wins (explicit downgrade signal).

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, billing, session } = await authenticate.admin(request);

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
        shop {
          plan { partnerDevelopment }
        }
      }
    `);
    const data = await response.json();
    const subs: Array<{ id: string; status: string }> =
      data.data?.currentAppInstallation?.activeSubscriptions ?? [];
    const isDevStore: boolean =
      data.data?.shop?.plan?.partnerDevelopment ?? false;

    let isPro: boolean;

    if (isDevStore) {
      // Step 1: If Shopify just sent a plan_handle redirect, write it immediately.
      if (planHandleParam) {
        await setShopPlan(session.shop, planHandleParam.toLowerCase());
        isPro = planHandleParam.toLowerCase() === "pro";
        console.log(`[billing] DEV plan_handle="${planHandleParam}" → isPro=${isPro}`);
      } else {
        // Step 2: No redirect param — use billing.check({ isTest: true }) to get
        // the live state. This is the only API that sees test subscriptions.
        let billingCheckPro = false;
        try {
          const check = await billing.check({
            plans: [PLANS.PRO],
            isTest: true,
          });
          billingCheckPro = check.hasActivePayment;
          console.log(`[billing] DEV billing.check isTest=true → hasActivePayment=${billingCheckPro}`);
        } catch (billingErr) {
          // billing.check unavailable — fall back to SQLite cache.
          console.warn("[billing] billing.check failed:", billingErr);
          const storedPlan = await getShopPlan(session.shop);
          billingCheckPro = (storedPlan ?? "free").toLowerCase() === "pro";
        }
        isPro = billingCheckPro;
        // Keep SQLite in sync with the live check result.
        await setShopPlan(session.shop, isPro ? "pro" : "free");
      }
    } else {
      // Production store: activeSubscriptions is authoritative.
      const isProFromAPI = subs.some((s) =>
        ["ACTIVE", "TRIALING"].includes(s.status)
      );
      // plan_handle=free is an explicit downgrade signal even during billing-period lag.
      isPro = planHandleParam === "free" ? false : isProFromAPI;
      await setShopPlan(session.shop, isPro ? "pro" : "free");
      console.log(`[billing] PROD subs=${subs.length} plan_handle="${planHandleParam}" → isPro=${isPro}`);
    }

    return json({ isPro, justChangedPlan, pricingUrl });
  } catch (err) {
    console.error("[billing] GraphQL failed, using cached plan:", err);
    const storedPlan = await getShopPlan(session.shop);
    return json({
      isPro: (storedPlan ?? "free").toLowerCase() === "pro",
      justChangedPlan,
      pricingUrl,
    });
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
