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
// Upgrades are handled by redirecting to Shopify's managed pricing page.
// billing.check() still works to read the current subscription status.

const IS_TEST = process.env.BILLING_TEST !== "false";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  try {
    const { hasActivePayment, appSubscriptions } = await billing.check({
      isTest: IS_TEST,
    });
    return json({ isPro: hasActivePayment, subscriptions: appSubscriptions });
  } catch {
    return json({ isPro: false, subscriptions: [] });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, redirect } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "cancel") {
    // For Managed Pricing, cancellation is handled by Shopify.
    // Redirect merchant to their subscription management page.
    return redirect(
      `shopify://admin/charges/${process.env.SHOPIFY_API_KEY}/pricing_plans`
    );
  }

  // Managed Pricing: redirect to Shopify's plan selection page.
  // The merchant approves the subscription there and is returned to the app.
  return redirect(
    `shopify://admin/charges/${process.env.SHOPIFY_API_KEY}/pricing_plans`
  );
};

export default function BillingPage() {
  const { isPro } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();

  return (
    <Page
      title="Plans"
      backAction={{ content: "Home", url: "/app" }}
    >
      {actionData && "billingError" in actionData && (actionData as any).billingError && (
        <Banner tone="warning" title="Billing error">
          <p>Could not initiate the billing flow. Please try again or contact support.</p>
        </Banner>
      )}
      {actionData && "cancelled" in actionData && (
        <Banner tone="info" title="Subscription cancelled">
          <p>You have been downgraded to the Free plan.</p>
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
              {isPro && (
                <Button
                  variant="plain"
                  tone="critical"
                  onClick={() =>
                    submit({ intent: "cancel" }, { method: "post" })
                  }
                >
                  Manage subscription
                </Button>
              )}
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
              {!isPro && (
                <Button
                  variant="primary"
                  size="large"
                  onClick={() => submit({}, { method: "post" })}
                >
                  Start 7-day free trial
                </Button>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
