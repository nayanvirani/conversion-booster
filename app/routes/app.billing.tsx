import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { json } from "@remix-run/node";
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
import { authenticate, PLANS } from "../shopify.server";

// Managed Pricing app: billing.request() is blocked by Shopify.
// Upgrade flow: throw a server-side redirect to /auth/exit-iframe.
// The SDK's auth.$.tsx loader intercepts that path, loads App Bridge, and
// calls window.open(pricingUrl, "_top") — navigating the top-level Shopify
// admin frame to the plan selection page.

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const justUpgraded = url.searchParams.has("charge_id");

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

    return json({ isPro, subscriptions: activeSubscriptions, justUpgraded, shop: session.shop });
  } catch (err) {
    console.error("[billing] Failed to query subscription status:", err);
    return json({ isPro: false, subscriptions: [], justUpgraded: false, shop: session.shop });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shopName = session.shop.replace(".myshopify.com", "");
  const apiKey = process.env.SHOPIFY_API_KEY || "";
  const pricingUrl = `https://admin.shopify.com/store/${shopName}/charges/${apiKey}/pricing_plans`;

  // Carry forward shop/host/embedded params from the current request URL so
  // the exit-iframe page can initialise App Bridge correctly.
  const requestUrl = new URL(request.url);
  const params = new URLSearchParams(requestUrl.searchParams);
  params.set("exitIframe", pricingUrl);
  // Ensure shop is present even if the page was loaded via client-side nav.
  params.set("shop", session.shop);

  // Throw so Remix propagates this as a Response through the error boundary.
  // The auth.$.tsx loader calls authenticate.admin which detects /auth/exit-iframe,
  // renders App Bridge HTML, then calls window.open(pricingUrl, "_top").
  throw redirect(`/auth/exit-iframe?${params.toString()}`);
};

export default function BillingPage() {
  const { isPro, justUpgraded } = useLoaderData<typeof loader>();

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
              <Form method="post">
                {!isPro ? (
                  <Button
                    variant="primary"
                    size="large"
                    submit
                  >
                    Start 7-day free trial
                  </Button>
                ) : (
                  <Button
                    variant="plain"
                    tone="critical"
                    submit
                  >
                    Manage subscription
                  </Button>
                )}
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
