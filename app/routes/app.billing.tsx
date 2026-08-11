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
// SECURITY: ?plan_handle in the URL is NEVER trusted directly to grant Pro
// access. It is only a signal that the merchant just changed their plan on
// the Shopify pricing page. We always verify the actual subscription status
// with billing.check() (Shopify Admin API) before storing or displaying anything.
//
// Exception: plan_handle=free overrides billing.check() for the immediate
// display only — Shopify may keep a Pro subscription technically "active"
// until the billing period ends even after the merchant downgrades, but we
// respect the merchant's explicit choice from the pricing page.
//
// SQLite stores the API-verified plan so the home page reads a consistent
// value without making a separate API call on every navigation.

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const planHandleParam = url.searchParams.get("plan_handle");
  const justChangedPlan = planHandleParam !== null;

  // Build the pricing URL server-side.
  const shopName = session.shop.replace(".myshopify.com", "");
  const appHandle = process.env.SHOPIFY_APP_HANDLE || "conversion-booster-11";
  const pricingUrl = `https://admin.shopify.com/store/${shopName}/charges/${appHandle}/pricing_plans`;

  try {
    // ALWAYS verify with Shopify — never derive plan status from the URL alone.
    // billing.check() calls currentAppInstallation.activeSubscriptions under
    // the hood and works for Shopify App Pricing / Managed Pricing.
    const { hasActivePayment } = await billing.check({ isTest: false });

    // Determine the verified plan:
    // - plan_handle=free: merchant just chose Free on the pricing page.
    //   Override billing.check() even if it still says Pro (billing period lag).
    //   This is safe — Shopify generated the redirect; the user didn't type it.
    // - plan_handle=pro or any other value: IGNORE the URL param.
    //   Trust billing.check() exclusively. A user manually typing plan_handle=pro
    //   would fail here because billing.check() returns false for non-subscribers.
    // - No plan_handle: trust billing.check() as normal.
    const isPro = planHandleParam === "free" ? false : hasActivePayment;

    // Persist the API-verified result so the home page stays consistent.
    await setShopPlan(session.shop, isPro ? "pro" : "free");

    console.log(
      `[billing] isPro=${isPro} (billingCheck=${hasActivePayment}, plan_handle="${planHandleParam}") → stored "${isPro ? "pro" : "free"}"`
    );

    return json({ isPro, justChangedPlan, pricingUrl });
  } catch (err) {
    console.error("[billing] billing.check() failed:", err);

    // Fallback: read the last verified value from SQLite.
    // Do NOT grant Pro from plan_handle=pro — we couldn't verify with Shopify.
    const storedPlan = await getShopPlan(session.shop);
    const isPro = storedPlan?.toLowerCase() === "pro";
    return json({ isPro, justChangedPlan, pricingUrl });
  }
};

export default function BillingPage() {
  const { isPro, justChangedPlan, pricingUrl } = useLoaderData<typeof loader>();

  const goToPricingPage = () => {
    // App Bridge v4 — postMessage navigation, no user-gesture restriction.
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
