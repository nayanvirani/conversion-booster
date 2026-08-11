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
import { updatePlanMetafield } from "../plan.server";

// ─── Plan detection strategy ────────────────────────────────────────────────
//
// activeSubscriptions includes test subscriptions on dev stores, so a single
// API call works for both store types.  The subtlety is timing: there's a
// brief lag between the merchant clicking "Test with this plan" and the
// subscription appearing in the API.  Shopify fires a plan_handle redirect
// immediately, so we use it as a trust-worthy override.
//
// Priority order (highest → lowest):
//   1. plan_handle=free  — explicit downgrade from Shopify's redirect
//   2. plan_handle=pro   — explicit upgrade; trust on dev stores (API lag),
//                          and confirmed by API on production
//   3. activeSubscriptions — live API truth on both store types
//   4. SQLite cache      — fallback when the API call fails entirely
//
// Security: plan_handle=pro is NOT trusted on production stores without API
// confirmation, so a fake URL param cannot grant Pro access to paying merchants.

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
          id
          activeSubscriptions { id status }
        }
        shop {
          plan { partnerDevelopment }
        }
      }
    `);
    const data = await response.json();
    const appInstallationId: string =
      data.data?.currentAppInstallation?.id ?? "";
    const subs: Array<{ id: string; status: string }> =
      data.data?.currentAppInstallation?.activeSubscriptions ?? [];
    const isDevStore: boolean =
      data.data?.shop?.plan?.partnerDevelopment ?? false;

    const isProFromAPI = subs.some((s) =>
      ["ACTIVE", "TRIALING"].includes(s.status)
    );

    let isPro: boolean;

    if (planHandleParam === "free") {
      // Explicit downgrade from Shopify's pricing page redirect.
      isPro = false;
    } else if (planHandleParam && planHandleParam.toLowerCase() === "pro") {
      // Shopify just redirected after Pro selection.
      // On dev stores trust it immediately (API may lag after test subscription creation).
      // On production stores: only accept if the API also confirms it.
      isPro = isDevStore ? true : isProFromAPI;
    } else {
      // No plan_handle in URL → trust the live API directly.
      // Empty activeSubscriptions means Free (not an API lag) — the lag is
      // already handled by plan_handle=pro on the initial upgrade redirect.
      isPro = isProFromAPI;
    }

    await setShopPlan(session.shop, isPro ? "pro" : "free");
    // Sync metafield so Liquid theme extensions gate Pro-only widgets correctly.
    await updatePlanMetafield(admin, appInstallationId, isPro);

    console.log(
      `[billing] dev=${isDevStore} subs=${subs.length} plan_handle="${planHandleParam}" → isPro=${isPro}`
    );

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
