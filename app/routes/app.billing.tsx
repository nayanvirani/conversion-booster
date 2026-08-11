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
import { updatePlanMetafield } from "../plan.server";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getSubscriptionStatus(admin: any) {
  const response = await admin.graphql(`
    #graphql
    query GetPlanStatus {
      currentAppInstallation {
        id
        activeSubscriptions { id status name test }
      }
      shop { plan { partnerDevelopment } }
    }
  `);
  const data = await response.json();
  return {
    appInstallationId: (data.data?.currentAppInstallation?.id ?? "") as string,
    subs: (data.data?.currentAppInstallation?.activeSubscriptions ?? []) as Array<{
      id: string; status: string; name: string; test: boolean;
    }>,
    isDevStore: (data.data?.shop?.plan?.partnerDevelopment ?? false) as boolean,
  };
}

async function cancelAllSubscriptions(admin: any, subs: Array<{ id: string }>) {
  if (subs.length === 0) return;
  await Promise.allSettled(
    subs.map((sub) =>
      admin.graphql(
        `#graphql
         mutation CancelSub($id: ID!) {
           appSubscriptionCancel(id: $id) {
             userErrors { field message }
           }
         }`,
        { variables: { id: sub.id } }
      )
    )
  );
}

// ─── Action — "Force sync to Free" button ───────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const { subs, appInstallationId } = await getSubscriptionStatus(admin);

  console.log(`[billing/action] force-sync-free for ${session.shop}, cancelling ${subs.length} sub(s)`);
  await cancelAllSubscriptions(admin, subs);
  await setShopPlan(session.shop, "free");
  await updatePlanMetafield(admin, appInstallationId, false);

  return redirect("/app/billing");
};

// ─── Loader ──────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const planHandleParam = url.searchParams.get("plan_handle");
  const justChangedPlan = planHandleParam !== null;

  const shopName = session.shop.replace(".myshopify.com", "");
  const appHandle = process.env.SHOPIFY_APP_HANDLE || "conversion-booster-11";
  const pricingUrl = `https://admin.shopify.com/store/${shopName}/charges/${appHandle}/pricing_plans`;

  try {
    const { appInstallationId, subs, isDevStore } = await getSubscriptionStatus(admin);

    const isProFromAPI = subs.some((s) =>
      ["ACTIVE", "TRIALING"].includes(s.status)
    );

    const planHandleLower = (planHandleParam ?? "").toLowerCase();
    let isPro: boolean;

    if (planHandleLower === "free") {
      // ── Explicit Free redirect from Shopify pricing page ──────────────────
      // Shopify does NOT auto-cancel test subscriptions on dev stores when the
      // merchant selects Free. Cancel them here so subsequent loads are correct.
      isPro = false;
      if (subs.length > 0) {
        console.log(`[billing] plan_handle=free — cancelling ${subs.length} sub(s) for ${session.shop}`);
        await cancelAllSubscriptions(admin, subs);
      }
    } else if (planHandleLower === "pro") {
      // ── Explicit Pro redirect from Shopify pricing page ───────────────────
      // Trust immediately on dev stores (API may lag after test sub creation).
      // On production stores verify with the live API first.
      isPro = isDevStore ? true : isProFromAPI;
    } else {
      // ── Regular page load (no plan_handle) ───────────────────────────────
      // Use activeSubscriptions as the source of truth.
      isPro = isProFromAPI;
    }

    await setShopPlan(session.shop, isPro ? "pro" : "free");
    await updatePlanMetafield(admin, appInstallationId, isPro);

    console.log(
      `[billing] shop=${session.shop} dev=${isDevStore} plan_handle="${planHandleParam}" ` +
      `subs=${subs.length} isProFromAPI=${isProFromAPI} → isPro=${isPro}`
    );

    return json({ isPro, justChangedPlan, pricingUrl, isDevStore });
  } catch (err) {
    console.error("[billing] GraphQL failed, using cached plan:", err);
    const storedPlan = await getShopPlan(session.shop);
    return json({
      isPro: (storedPlan ?? "free").toLowerCase() === "pro",
      justChangedPlan,
      pricingUrl,
      isDevStore: false,
    });
  }
};

// ─── UI ──────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { isPro, justChangedPlan, pricingUrl, isDevStore } =
    useLoaderData<typeof loader>();

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
          <p>You&apos;re now on the Free plan. You can upgrade again any time.</p>
        </Banner>
      )}

      {/* Self-healing banner — only shown on dev stores when plan is out of sync.
          On production stores activeSubscriptions is always authoritative. */}
      {isDevStore && isPro && (
        <Banner tone="warning" title="Shopify shows Free as your current plan?">
          <BlockStack gap="200">
            <p>
              If the Shopify pricing page already shows <strong>Free</strong> as
              current but this page still shows Pro, click below to sync.
            </p>
            <Form method="post">
              <Button submit variant="plain" tone="critical">
                Force sync to Free
              </Button>
            </Form>
          </BlockStack>
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
                <List.Item>&quot;Powered by Boostify&quot; branding</List.Item>
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
              <Text as="p" variant="bodyMd" tone="subdued">
                Everything in Free, plus:
              </Text>
              <List>
                <List.Item>Sticky Add to Cart</List.Item>
                <List.Item>Social Proof Popup</List.Item>
                <List.Item>No &quot;Powered by&quot; branding</List.Item>
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
