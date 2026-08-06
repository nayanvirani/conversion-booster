import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useActionData, useLoaderData, useSubmit } from "@remix-run/react";
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

// This app uses Shopify Managed Pricing — billing.request() is blocked.
// billing.check() requires a billing config in shopifyApp(), which we don't have.
// Instead, query currentAppInstallation directly to read subscription status.

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  // If Shopify redirected back after plan selection, charge_id will be in URL.
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
    const activeSubscriptions: Array<{ id: string; name: string; status: string; trialDays: number }> =
      data.data?.currentAppInstallation?.activeSubscriptions ?? [];

    const isPro = activeSubscriptions.some(
      (sub) => sub.name === PLANS.PRO && sub.status === "ACTIVE"
    );

    return json({ isPro, subscriptions: activeSubscriptions, justUpgraded });
  } catch (err) {
    console.error("[billing] Failed to query subscription status:", err);
    return json({ isPro: false, subscriptions: [], justUpgraded: false });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { redirect } = await authenticate.admin(request);

  // Managed Pricing: both upgrade and manage-subscription redirect to Shopify's
  // plan selection page. Shopify handles the billing flow and returns the merchant
  // to the app URL with ?charge_id=... when a plan is selected.
  return redirect(
    `shopify://admin/charges/${process.env.SHOPIFY_API_KEY}/pricing_plans`
  );
};

export default function BillingPage() {
  const { isPro, justUpgraded } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();

  return (
    <Page
      title="Plans"
      backAction={{ content: "Home", url: "/app" }}
    >
      {justUpgraded && !isPro && (
        <Banner tone="info" title="Plan selected">
          <p>Your subscription is being processed. Please refresh in a moment.</p>
        </Banner>
      )}
      {justUpgraded && isPro && (
        <Banner tone="success" title="Welcome to Pro!">
          <p>Your Pro subscription is now active. Enjoy all Pro features.</p>
        </Banner>
      )}
      {actionData && "billingError" in actionData && (actionData as any).billingError && (
        <Banner tone="warning" title="Billing error">
          <p>Could not initiate the billing flow. Please try again or contact support.</p>
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
                  onClick={() => submit({}, { method: "post" })}
                >
                  Start 7-day free trial
                </Button>
              ) : (
                <Button
                  variant="plain"
                  tone="critical"
                  onClick={() => submit({}, { method: "post" })}
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
