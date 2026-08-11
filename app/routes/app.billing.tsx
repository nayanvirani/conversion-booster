import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
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

// Plan status strategy:
//
// DEV stores (partnerDevelopment=true):
//   Both billing.check() and activeSubscriptions are broken on dev stores —
//   billing.check() returns true even when Shopify's pricing page shows Free.
//   Only reliable signal: plan_handle from Shopify's own redirect + SQLite cache.
//
// PRODUCTION stores:
//   activeSubscriptions is the source of truth. URL param never grants Pro.
//   plan_handle=free overrides (safe downgrade override for billing-period lag).

// POST action: called when merchant clicks "Plan not showing correctly? Click to sync".
// Resets the stored plan to "free" and reloads the billing page.
// On reload the loader reads SQLite (now "free") and shows Free correctly.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  await setShopPlan(session.shop, "free");
  console.log(`[billing/action] Cleared stale plan for ${session.shop} → free`);
  return redirect("/app/billing");
};

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
      // DEV STORE: Shopify billing APIs are unreliable — trust plan_handle + SQLite.
      if (planHandleParam) {
        await setShopPlan(session.shop, planHandleParam);
      }
      const storedPlan = await getShopPlan(session.shop);
      // Default to "free" when nothing stored yet (fresh install).
      isPro = (storedPlan?.toLowerCase() ?? "free") === "pro";
    } else {
      // PRODUCTION STORE: activeSubscriptions is the source of truth.
      const isProFromAPI = subs.some((s) =>
        ["ACTIVE", "TRIALING"].includes(s.status)
      );
      isPro = planHandleParam === "free" ? false : isProFromAPI;
      setShopPlan(session.shop, isPro ? "pro" : "free");
    }

    console.log(
      `[billing] isDevStore=${isDevStore} plan_handle="${planHandleParam}" subs=${subs.length} → isPro=${isPro}`
    );

    return json({ isPro, justChangedPlan, pricingUrl });
  } catch (err) {
    console.error("[billing] GraphQL failed:", err);
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

        {/* Plan status out of sync? Force a re-sync via the pricing page */}
        <Layout.Section>
          <InlineStack align="center">
            <Form method="post">
              <Button variant="plain" submit tone="critical">
                Plan not showing correctly? Click to sync
              </Button>
            </Form>
          </InlineStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
