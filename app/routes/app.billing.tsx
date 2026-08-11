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

// ─── Plan detection — how this works ─────────────────────────────────────────
//
// Every page load calls the Shopify Admin API and reads activeSubscriptions.
// That is the source of truth for production stores.
//
// Dev stores have a quirk: when the merchant clicks "Test with this plan → Free"
// on Shopify's pricing page, Shopify does NOT cancel the previous test
// subscription.  So activeSubscriptions keeps returning ACTIVE even though the
// pricing page shows Free as current.
//
// To detect a stale test subscription automatically:
//   • When plan_handle=pro fires (the only reliable "upgrade" signal from
//     Shopify), we record a timestamp in SQLite (pro_granted_at).
//   • On every regular load for a dev store we compare now vs pro_granted_at.
//     If the subscription is ACTIVE but the grant was > 2 h ago (or never
//     recorded), the subscription is stale → cancel it via API → Free.
//
// Production stores: no timestamps needed.  Shopify properly cancels real
// subscriptions, so activeSubscriptions is always accurate.

const PRO_GRANT_TTL_SEC = 2 * 60 * 60; // 2 hours

async function fetchPlanFromAPI(admin: any) {
  const res = await admin.graphql(`
    #graphql
    query GetPlan {
      currentAppInstallation {
        id
        activeSubscriptions { id status test }
      }
      shop { plan { partnerDevelopment } }
    }
  `);
  const d = await res.json();
  return {
    installationId: (d.data?.currentAppInstallation?.id ?? "") as string,
    subs: (d.data?.currentAppInstallation?.activeSubscriptions ?? []) as
      Array<{ id: string; status: string; test: boolean }>,
    isDevStore: (d.data?.shop?.plan?.partnerDevelopment ?? false) as boolean,
  };
}

async function cancelSubs(admin: any, subs: Array<{ id: string }>) {
  if (!subs.length) return;
  await Promise.allSettled(
    subs.map((s) =>
      admin.graphql(
        `#graphql
         mutation Cancel($id: ID!) {
           appSubscriptionCancel(id: $id) { userErrors { field message } }
         }`,
        { variables: { id: s.id } }
      )
    )
  );
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const url       = new URL(request.url);
  const handle    = (url.searchParams.get("plan_handle") ?? "").toLowerCase();
  const justChanged = handle !== "";

  const shopName = session.shop.replace(".myshopify.com", "");
  const appHandle = process.env.SHOPIFY_APP_HANDLE ?? "conversion-booster-11";
  const pricingUrl = `https://admin.shopify.com/store/${shopName}/charges/${appHandle}/pricing_plans`;

  try {
    // ── 1. Ask Shopify API for current subscriptions ──────────────────────
    const { installationId, subs, isDevStore } = await fetchPlanFromAPI(admin);
    const apiSaysPro = subs.some((s) => ["ACTIVE", "TRIALING"].includes(s.status));

    let isPro: boolean;

    if (handle === "free") {
      // ── 2a. Merchant just selected Free on the pricing page ───────────
      // Cancel any active subscription so the API is correct on the next load.
      isPro = false;
      if (subs.length) {
        console.log(`[plan] plan_handle=free — cancelling ${subs.length} sub(s)`);
        await cancelSubs(admin, subs);
      }

    } else if (handle === "pro") {
      // ── 2b. Merchant just selected Pro on the pricing page ────────────
      // Trust immediately on dev stores (API can lag after test sub creation).
      // Verify via API on production stores (real money on the line).
      isPro = isDevStore ? true : apiSaysPro;
      if (isPro) await recordProGrant(session.shop);  // record timestamp

    } else {
      // ── 2c. Regular page load — check API and auto-fix stale dev subs ─
      if (!isDevStore) {
        // Production: activeSubscriptions is always accurate. Use it directly.
        isPro = apiSaysPro;

      } else if (!apiSaysPro) {
        // Dev store, no active subscription → Free.
        isPro = false;

      } else {
        // Dev store, API says there IS an active subscription.
        // Check whether it was recently granted (within 2 h) by a plan_handle=pro
        // redirect.  If yes it's a legitimate upgrade; if no it's a stale test
        // subscription that Shopify forgot to cancel → cancel it automatically.
        const grantedAt = await getProGrantedAt(session.shop);
        const age = grantedAt ? Math.floor(Date.now() / 1000) - grantedAt : Infinity;

        if (age < PRO_GRANT_TTL_SEC) {
          isPro = true;
          console.log(`[plan] dev Pro subscription is fresh (${Math.round(age / 60)} min old) → Pro`);
        } else {
          console.log(`[plan] dev Pro subscription is stale (${Math.round(age / 60)} min old) → auto-cancel → Free`);
          await cancelSubs(admin, subs);
          isPro = false;
        }
      }
    }

    // ── 3. Update SQLite + theme metafield ────────────────────────────────
    await setShopPlan(session.shop, isPro ? "pro" : "free");
    await updatePlanMetafield(admin, installationId, isPro);

    console.log(`[plan] ${session.shop} dev=${isDevStore} handle="${handle}" apiSaysPro=${apiSaysPro} → isPro=${isPro}`);

    return json({ isPro, justChanged, pricingUrl });

  } catch (err) {
    console.error("[plan] API call failed — falling back to SQLite:", err);
    const stored = await getShopPlan(session.shop);
    return json({ isPro: stored === "pro", justChanged, pricingUrl });
  }
};

export default function BillingPage() {
  const { isPro, justChanged, pricingUrl } = useLoaderData<typeof loader>();

  const openPricingPage = () => {
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
      {justChanged && isPro && (
        <Banner tone="success" title="Welcome to Pro!">
          <p>Your Pro subscription is now active. Enjoy all Pro features.</p>
        </Banner>
      )}
      {justChanged && !isPro && (
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
              <Text as="p" variant="bodyMd" tone="subdued">Everything in Free, plus:</Text>
              <List>
                <List.Item>Sticky Add to Cart</List.Item>
                <List.Item>Social Proof Popup</List.Item>
                <List.Item>No &quot;Powered by&quot; branding</List.Item>
                <List.Item>Priority email support</List.Item>
                <List.Item>All future widgets</List.Item>
              </List>
              {!isPro ? (
                <Button variant="primary" size="large" onClick={openPricingPage}>
                  Start 7-day free trial
                </Button>
              ) : (
                <Button variant="plain" tone="critical" onClick={openPricingPage}>
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
