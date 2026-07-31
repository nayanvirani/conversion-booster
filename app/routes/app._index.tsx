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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const { hasActivePayment } = await billing.check({ isTest: false });
  return json({ isPro: hasActivePayment });
};

const WIDGETS = [
  {
    name: "Announcement Bar",
    description: "Rotating messages with optional CTA button and sticky mode.",
    proOnly: false,
    location: "App embeds",
  },
  {
    name: "Trust Badges",
    description: "4 customizable badges with inline SVG icons, zero image requests.",
    proOnly: false,
    location: "Add block → product page",
  },
  {
    name: "Countdown Timer",
    description: "Fixed end date or per-visitor evergreen mode for urgency.",
    proOnly: false,
    location: "Add block → any section",
  },
  {
    name: "Sticky Add to Cart",
    description: "Floating bar appears when main buy button scrolls out of view.",
    proOnly: true,
    location: "App embeds",
  },
  {
    name: "Social Proof Popup",
    description: "Shows real products from a collection you pick (e.g. best-sellers).",
    proOnly: true,
    location: "App embeds",
  },
];

export default function Index() {
  const { isPro } = useLoaderData<typeof loader>();

  return (
    <Page title="Boostify">
      <BlockStack gap="500">
        {!isPro && (
          <Banner
            title="Upgrade to Pro — $9.99/mo"
            action={{ content: "Start 7-day free trial", url: "/app/billing" }}
            tone="info"
          >
            <p>
              Unlock Sticky Add to Cart and Social Proof Popup, remove branding,
              and get priority support.
            </p>
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Quick Setup Guide
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  All widgets live in your Shopify theme editor — no coding
                  required.
                </Text>
                <Divider />

                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">
                    Step 1 — Enable App Embeds (whole-store widgets)
                  </Text>
                  <Text as="p" variant="bodyMd">
                    Go to{" "}
                    <strong>
                      Online Store → Themes → Customize → App embeds
                    </strong>{" "}
                    and toggle on:
                  </Text>
                  <List>
                    <List.Item>Announcement Bar</List.Item>
                    <List.Item>Sticky Add to Cart (Pro)</List.Item>
                    <List.Item>Social Proof Popup (Pro)</List.Item>
                  </List>
                </BlockStack>

                <Divider />

                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">
                    Step 2 — Add App Blocks (per-section widgets)
                  </Text>
                  <Text as="p" variant="bodyMd">
                    Open any page section and click{" "}
                    <strong>Add block → Boostify</strong>:
                  </Text>
                  <List>
                    <List.Item>
                      Countdown Timer — works best on product pages
                    </List.Item>
                    <List.Item>
                      Trust Badges — works best on product pages or footer
                    </List.Item>
                  </List>
                </BlockStack>

                <Divider />

                <InlineStack>
                  <Button
                    url="https://admin.shopify.com/themes/current/editor"
                    target="_blank"
                    variant="primary"
                  >
                    Open Theme Editor
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">
                    Your Widgets
                  </Text>
                  {isPro ? (
                    <Badge tone="success">Pro</Badge>
                  ) : (
                    <Badge>Free</Badge>
                  )}
                </InlineStack>

                <BlockStack gap="300">
                  {WIDGETS.map((w) => (
                    <Card key={w.name}>
                      <BlockStack gap="100">
                        <InlineStack align="space-between">
                          <Text as="h3" variant="headingSm">
                            {w.name}
                          </Text>
                          {w.proOnly && !isPro ? (
                            <Badge tone="warning">Pro only</Badge>
                          ) : (
                            <Badge tone="success">Active</Badge>
                          )}
                        </InlineStack>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {w.description}
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Location: {w.location}
                        </Text>
                      </BlockStack>
                    </Card>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
