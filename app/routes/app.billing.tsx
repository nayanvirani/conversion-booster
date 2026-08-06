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

// isTest: true  → Shopify shows a "Test charge" badge so reviewers can approve
//                  without real money; real merchants can also approve test charges.
// Switch to false after the app is approved and live.
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
  const { billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "cancel") {
    try {
      const { appSubscriptions } = await billing.check({ isTest: IS_TEST });
      const active = appSubscriptions[0];
      if (active) {
        await billing.cancel({
          subscriptionId: active.id,
          isTest: IS_TEST,
          prorate: true,
        });
      }
    } catch {
      // Billing not available on all store types — non-fatal
    }
    return json({ cancelled: true });
  }

  // billing.request() always throws a redirect Response to the Shopify billing
  // confirmation URL. We must re-throw it — catching and swallowing it would
  // keep the user on this page and block the upgrade flow entirely.
  try {
    await billing.request({
      plan: PLANS.PRO,
      isTest: IS_TEST,
      returnUrl: `${process.env.SHOPIFY_APP_URL}/app`,
    });
  } catch (err) {
    // Re-throw redirect Responses from the billing SDK (this is the normal path)
    if (err instanceof Response) throw err;
    // Only reach here on genuine API errors
    return json({ billingError: true });
  }

  // billing.request() always throws, so this line is unreachable.
  return null;
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
      {actionData && "billingError" in actionData && actionData.billingError && (
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
                  Downgrade to Free
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
