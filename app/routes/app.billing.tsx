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
import { authenticate, PLANS } from "../shopify.server";

// Managed Pricing app — billing.request() is blocked by Shopify.
//
// Upgrade flow:
//   1. Component calls window.location.href = exitIframeUrl  (full iframe page load)
//   2. Browser loads /auth/exit-iframe?exitIframe={pricingUrl}&shop=…
//   3. SDK (auth.$.tsx → authenticate.admin) detects exit-iframe path,
//      renders a tiny HTML page that loads the App Bridge CDN script and then
//      calls window.open(pricingUrl, "_top")
//   4. App Bridge proxies window.open via postMessage, navigating the parent
//      Shopify admin frame to the Managed Pricing plan selection page.
//
// Using window.location.href is essential: Remix form submissions go via fetch(),
// and Remix's client router receives the HTML response body but cannot render it
// as a real document — it just shows the HTTP status ("200") via the error boundary.

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const justUpgraded = url.searchParams.has("charge_id");

  // Build the exit-iframe URL here (server-side) so we have access to the
  // session shop and env vars without exposing them to the client bundle.
  const shopName = session.shop.replace(".myshopify.com", "");
  const apiKey = process.env.SHOPIFY_API_KEY || "";
  const pricingUrl = `https://admin.shopify.com/store/${shopName}/charges/${apiKey}/pricing_plans`;

  const exitParams = new URLSearchParams();
  exitParams.set("exitIframe", pricingUrl);
  exitParams.set("shop", session.shop);
  const host = url.searchParams.get("host");
  if (host) exitParams.set("host", host);
  const upgradeUrl = `/auth/exit-iframe?${exitParams.toString()}`;

  try {
    const response = await admin.graphql(`
      #graphql
      query GetAppSubscription {
        currentAppInstallation {
          activeSubscriptions {
            id
            name
            status
            trialDays
          }
        }
      }
    `);
    const data = await response.json();
    const activeSubscriptions: Array<{
      id: string;
      name: string;
      status: string;
      trialDays: number;
    }> = data.data?.currentAppInstallation?.activeSubscriptions ?? [];

    const isPro = activeSubscriptions.some(
      (sub) => sub.name === PLANS.PRO && sub.status === "ACTIVE"
    );

    return json({ isPro, subscriptions: activeSubscriptions, justUpgraded, upgradeUrl });
  } catch (err) {
    console.error("[billing] Failed to query subscription status:", err);
    return json({ isPro: false, subscriptions: [], justUpgraded: false, upgradeUrl });
  }
};

export default function BillingPage() {
  const { isPro, justUpgraded, upgradeUrl } = useLoaderData<typeof loader>();

  // Full iframe page navigation — NOT a Remix fetch.
  // The exit-iframe page loads App Bridge then calls window.open(url, "_top").
  const goToPricingPage = () => {
    window.location.href = upgradeUrl;
  };

  return (
    <Page
      title="Plans"
      backAction={{ content: "Home", url: "/app" }}
    >
      {justUpgraded && isPro && (
        <Banner tone="success" title="Welcome to Pro!">
          <p>Your Pro subscription is now active. Enjoy all Pro features.</p>
        </Banner>
      )}
      {justUpgraded && !isPro && (
        <Banner tone="info" title="Plan selected">
          <p>Your subscription is being processed. Refresh in a moment to see your updated plan.</p>
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
                <Button
                  variant="primary"
                  size="large"
                  onClick={goToPricingPage}
                >
                  Start 7-day free trial
                </Button>
              ) : (
                <Button
                  variant="plain"
                  tone="critical"
                  onClick={goToPricingPage}
                >
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
