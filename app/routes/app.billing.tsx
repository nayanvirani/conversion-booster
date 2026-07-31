import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import {
  Badge,
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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  try {
    const { hasActivePayment, appSubscriptions } = await billing.check({
      isTest: false,
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
    const { appSubscriptions } = await billing.check({ isTest: false });
    const active = appSubscriptions[0];
    if (active) {
      await billing.cancel({
        subscriptionId: active.id,
        isTest: false,
        prorate: true,
      });
    }
    return json({ cancelled: true });
  }

  await billing.request({
    plan: PLANS.PRO as never,
    isTest: false,
    returnUrl: `${process.env.SHOPIFY_APP_URL}/app`,
  });
  return null;
};

export default function BillingPage() {
  const { isPro } = useLoaderData<typeof loader>();
  const submit = useSubmit();

  return (
    <Page
      title="Plans"
      backAction={{ content: "Home", url: "/app" }}
    >
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
