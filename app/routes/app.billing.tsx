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
import { getShopPlan, setShopPlan, recordProGrant, getProGrantedAt } from "../db.server";
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

// ─── How plan detection works ────────────────────────────────────────────────
//
// Dev stores (partnerDevelopment = true):
//   Test subscriptions are unreliable — Shopify's pricing page and
//   activeSubscriptions can show different states after plan switches.
//
//   Strategy:
//   1. plan_handle=pro  → grant Pro immediately; record timestamp in SQLite.
//   2. plan_handle=free → force Free; cancel any active subscriptions.
//   3. Regular load     → if a pro grant exists and is < 2 hours old, the
//                         subscription is fresh (user just upgraded).
//                         If the grant is older or missing, the subscription
//                         is stale → auto-cancel and show Free.
//
// Production stores:
//   activeSubscriptions is authoritative. Shopify properly cancels real
//   subscriptions when the merchant downgrades, so the API is reliable.

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
    const isProFromAPI = subs.some((s) => ["ACTIVE", "TRIALING"].includes(s.status));
    const planHandleLower = (planHandleParam ?? "").toLowerCase();

    let isPro: boolean;

    if (planHandleLower === "free") {
      // ── Explicit downgrade via Shopify pricing page redirect ──────────────
      isPro = false;
      if (subs.length > 0) {
        console.log(`[billing] plan_handle=free — cancelling ${subs.length} sub(s) for ${session.shop}`);
        await cancelAllSubscriptions(admin, subs);
      }
      await setShopPlan(session.shop, "free");

    } else if (planHandleLower === "pro") {
      // ── Explicit upgrade via Shopify pricing page redirect ────────────────
      // Trust immediately on dev stores (API may lag after test sub creation).
      // On production stores verify with the live API first.
      isPro = isDevStore ? true : isProFromAPI;
      if (isPro) {
        // Record the exact time Pro was granted. Used on regular loads to
        // distinguish fresh subscriptions from stale test ones.
        await recordProGrant(session.shop);
      }

    } else {
      // ── Regular page load (no plan_handle) ───────────────────────────────
      if (!isDevStore) {
        // Production: activeSubscriptions is the authoritative source of truth.
        isPro = isProFromAPI;
        await setShopPlan(session.shop, isPro ? "pro" : "free");

      } else {
        // Dev store: activeSubscriptions can lie (test sub stays ACTIVE even
        // after the merchant picks Free on the pricing page). Use the
        // pro_granted_at timestamp to decide if the active subscription is
        // fresh (legit upgrade) or stale (should be Free).
        const PRO_GRANT_TTL_SECONDS = 2 * 60 * 60; // 2 hours
        const proGrantedAt = await getProGrantedAt(session.shop);
        const now = Math.floor(Date.now() / 1000);
        const grantIsFresh =
          proGrantedAt !== null && now - proGrantedAt < PRO_GRANT_TTL_SECONDS;

        if (isProFromAPI && grantIsFresh) {
          // Subscription is active AND was recently granted — user is on Pro.
          isPro = true;
          console.log(`[billing] dev fresh grant (${now - proGrantedAt!}s ago) → Pro`);
        } else if (isProFromAPI && !grantIsFresh) {
          // Subscription is active but the grant is old / missing — stale test
          // subscription. Auto-cancel it and show Free.
          console.log(`[billing] dev stale subscription (grant=${proGrantedAt}) — auto-cancelling`);
          await cancelAllSubscriptions(admin, subs);
          isPro = false;
        } else {
          // No active subscription → Free.
          isPro = false;
        }

        await setShopPlan(session.shop, isPro ? "pro" : "free");
      }
    }

    await updatePlanMetafield(admin, appInstallationId, isPro);

    console.log(
      `[billing] shop=${session.shop} dev=${isDevStore} plan_handle="${planHandleParam}" ` +
      `subs=${subs.length} → isPro=${isPro}`
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

// ─── UI ──────────────────────────────────────────────────────────────────────

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
          <p>You&apos;re now on the Free plan. You can upgrade again any time.</p>
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
