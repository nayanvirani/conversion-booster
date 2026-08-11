import { Page, Card, BlockStack, Text, Badge, InlineStack } from "@shopify/polaris";

// Analytics page — widget view/click tracking coming in a future release.
// This stub keeps the nav link live so the sidebar item works.

export default function Analytics() {
  return (
    <Page
      title="Analytics"
      titleMetadata={<Badge>Coming soon</Badge>}
      backAction={{ content: "Dashboard", url: "/app" }}
    >
      <Card>
        <BlockStack gap="400">
          <InlineStack align="center">
            <span style={{ fontSize: "48px" }}>📊</span>
          </InlineStack>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd" alignment="center">
              Analytics is on the way
            </Text>
            <Text as="p" variant="bodyMd" tone="subdued" alignment="center">
              We&apos;re building per-widget stats — how many times each widget was
              shown, clicked, and contributed to conversions. It will appear here
              automatically once it&apos;s live.
            </Text>
          </BlockStack>
        </BlockStack>
      </Card>
    </Page>
  );
}
