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

// Shopify App Pricing — subscription status strategy:
//
// Production stores:
//   currentAppInstallation.activeSubscriptions returns the real subscription.
//   Empty = Free. ACTIVE/TRIALING = Pro. Source of truth.
//
// Dev / partner-development stores:
//   Shopify ALWAYS returns [] for activeSubscriptions regardless of plan.
//   This is a Shopify platform restriction on dev stores.
//   We fall back to plan_handle (from Shopify's redirect) + SQLite cache.
//
// Security: plan_handle=pro is only trusted on dev stores (Shopify restriction
// forces the fallback). On production, activeSubscriptions is authoritative and
// a fake plan_handle=pro in the URL is ignored (no real subscription = no Pro).

async function getSubscriptionStatus(admin: any) {
  const response = await admin.graphql(`
    #graphql
    query GetSubscriptionStatus {
      currentAppInstallation {
        activeSubscriptions {
          id
          status
        }
      }
      shop {
        plan {
          partnerDevelopment
        }
      }
    }
  `);
  const data = await response.json();
  const subs: Array<{ id: string; status: string }> =
    data.data?.currentAppInstallation?.activeSubscriptions ?? [];
  const isDevStore: boolean =
    data.data?.shop?.plan?.partnerDevelopment ?? false;

  return { subs, isDevStore };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const planHandleParam = url.searchParams.get("plan_handle");
  const justChangedPlan = planHandleParam !== null;

  // Persist plan_handle when Shopify sends it (any plan selection).
  if (planHandleParam) {
    await setShopPlan(session.shop, planHandleParam);
    console.log(`[billing] plan_handle="${planHandleParam}" for ${session.shop}`);
  }

  const shopName = session.shop.replace(".myshopify.com", "");
  const appHandle = process.env.SHOPIFY_APP_HANDLE || "conversion-booster-11";
  const pricingUrl = `https://admin.shopify.com/store/${shopName}/charges/${appHandle}/pricing_plans`;

  try {
    const { subs, isDevStore } = await getSubscriptionStatus(admin);
    const isProFromShopify = subs.some((s) =>
      ["ACTIVE", "TRIALING"].includes(s.status)
    );

    console.log(
      `[billing] isDevStore=${isDevStore} subs=${JSON.stringify(subs)} plan_handle="${planHandleParam}"`
    );

    let isPro: boolean;

    if (planHandleParam === "free") {
      // Explicit downgrade from Shopify — trust immediately on any store type.
      isPro = false;
    } else if (isProFromShopify) {
      // Production store confirmed active subscription via API.
      isPro = true;
    } else if (isDevStore) {
      // Dev store restriction: activeSubscriptions always empty.
      // Fall back to plan_handle (trusted — Shopify generated the redirect)
      // or SQLite (set from a previous plan_handle redirect this session).
      if (planHandleParam === "pro") {
        isPro = true;
      } else {
        const storedPlan = await getShopPlan(session.shop);
        isPro = storedPlan?.toLowerCase() === "pro";
      }
    } else {
      // Production store, no active subscription → Free.
      isPro = false;
    }

    // Keep SQLite in sync with the resolved value.
    await setShopPlan(session.shop, isPro ? "pro" : "free");

    console.log(`[billing] isPro=${isPro}`);
    return json({ isPro, justChangedPlan, pricingUrl });
  } catch (err) {
    console.error("[billing] GraphQL failed:", err);
    // On error fall back to SQLite — do NOT grant Pro from URL alone.
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
