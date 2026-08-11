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
import { setShopPlan } from "../db.server";

// Shopify App Pricing (Managed Pricing).
//
// SECURITY: ?plan_handle in the URL is NEVER used to grant Pro access.
// We always query currentAppInstallation.activeSubscriptions (Shopify GraphQL)
// to get the real subscription state. A fake ?plan_handle=pro in the URL will
// fail here because GraphQL will return no active subscription for that shop.
//
// Why not billing.check()?
// billing.check() without billing config in shopify.server.ts has inconsistent
// behaviour for Managed Pricing — it was returning hasActivePayment=true even
// when the shop was clearly on the Free plan (confirmed by Shopify's own
// pricing_plans UI). activeSubscriptions is the raw source it reads from, so
// we go there directly.
//
// plan_handle=free is still used as an immediate UI override for downgrade:
// on dev stores Shopify cancels test subscriptions immediately, so in practice
// activeSubscriptions returns [] — but the override ensures correct display
// even if there's a lag.

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const planHandleParam = url.searchParams.get("plan_handle");
  const justChangedPlan = planHandleParam !== null;

  // Build the pricing URL server-side.
  const shopName = session.shop.replace(".myshopify.com", "");
  const appHandle = process.env.SHOPIFY_APP_HANDLE || "conversion-booster-11";
  const pricingUrl = `https://admin.shopify.com/store/${shopName}/charges/${appHandle}/pricing_plans`;

  try {
    // Query the live subscription state from Shopify.
    // activeSubscriptions is empty when the shop is on the Free plan.
    // Any ACTIVE or TRIALING entry means the shop has a paid plan.
    // We intentionally do NOT filter by name — the plan name in Partner Dashboard
    // ("PRO", "Pro", "Pro Plan", etc.) is not guaranteed to match any constant.
    const response = await admin.graphql(`
      #graphql
      query GetActiveSubscriptions {
        currentAppInstallation {
          activeSubscriptions {
            id
            name
            status
            test
          }
        }
      }
    `);
    const data = await response.json();
    const subs: Array<{ id: string; name: string; status: string; test: boolean }> =
      data.data?.currentAppInstallation?.activeSubscriptions ?? [];

    console.log("[billing] activeSubscriptions:", JSON.stringify(subs));

    const isProFromShopify = subs.some((s) =>
      ["ACTIVE", "TRIALING"].includes(s.status)
    );

    // plan_handle=free: user just chose Free on the pricing page.
    // Override Shopify result to show Free immediately (handles billing-period lag).
    // This is safe — Shopify generated the redirect, not the user.
    //
    // plan_handle=pro or any other value: IGNORED for isPro.
    // Shopify API must confirm an active subscription — URL param alone is not enough.
    const isPro = planHandleParam === "free" ? false : isProFromShopify;

    // Persist verified result so home page stays consistent.
    await setShopPlan(session.shop, isPro ? "pro" : "free");

    console.log(
      `[billing] isPro=${isPro} (shopify=${isProFromShopify}, plan_handle="${planHandleParam}")`
    );

    return json({ isPro, justChangedPlan, pricingUrl });
  } catch (err) {
    console.error("[billing] GraphQL query failed:", err);
    // On error do NOT grant Pro from URL param. Return false (safe default).
    return json({ isPro: false, justChangedPlan, pricingUrl });
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
