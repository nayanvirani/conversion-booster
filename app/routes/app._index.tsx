import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Button,
  Card,
  InlineStack,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { setShopPlan, getShopPlan, getProGrantedAt } from "../db.server";
import { updatePlanMetafield } from "../plan.server";

// ─── Widget catalogue ─────────────────────────────────────────────────────────
const WIDGETS = [
  {
    key: "bar",
    name: "Announcement Bar",
    desc: "Rotating messages with optional CTA button. Supports sticky mode.",
    proOnly: false,
    emoji: "📢",
  },
  {
    key: "timer",
    name: "Countdown Timer",
    desc: "Fixed date or evergreen mode. Drives urgency on product pages.",
    proOnly: false,
    emoji: "⏱",
  },
  {
    key: "trust",
    name: "Trust Badges",
    desc: "Four customizable badges using inline SVG — zero image requests.",
    proOnly: false,
    emoji: "🛡️",
  },
  {
    key: "satc",
    name: "Sticky Add to Cart",
    desc: "Floating bar appears when the main buy button scrolls out of view.",
    proOnly: true,
    emoji: "🛒",
  },
  {
    key: "popup",
    name: "Social Proof Popup",
    desc: "Shows real products from your catalog. No fake data — authentic FOMO that builds trust.",
    proOnly: true,
    emoji: "💬",
  },
];

// ─── Loader ───────────────────────────────────────────────────────────────────
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  // Shopify redirects back with ?plan_handle after the merchant picks a plan.
  // Forward to the billing page which verifies and persists the plan change.
  const url = new URL(request.url);
  if (url.searchParams.has("plan_handle")) {
    return redirect(`/app/billing?${url.searchParams.toString()}`);
  }

  try {
    const response = await admin.graphql(`
      #graphql
      query GetPlanStatus {
        currentAppInstallation {
          id
          activeSubscriptions { id status }
        }
        shop {
          plan { partnerDevelopment }
        }
      }
    `);
    const data = await response.json();
    const appInstallationId: string =
      data.data?.currentAppInstallation?.id ?? "";
    const subs: Array<{ id: string; status: string }> =
      data.data?.currentAppInstallation?.activeSubscriptions ?? [];
    const isDevStore: boolean =
      data.data?.shop?.plan?.partnerDevelopment ?? false;

    const apiSaysPro = subs.some((s) =>
      ["ACTIVE", "TRIALING"].includes(s.status)
    );

    // Mirror the same logic as app.billing.tsx — no cancellation here, just read.
    let isPro: boolean;
    if (!isDevStore) {
      isPro = apiSaysPro;
    } else if (!apiSaysPro) {
      isPro = false;
    } else {
      const grantedAt = await getProGrantedAt(session.shop);
      const age = grantedAt
        ? Math.floor(Date.now() / 1000) - grantedAt
        : Infinity;
      isPro = age < 2 * 60 * 60;
    }

    await setShopPlan(session.shop, isPro ? "pro" : "free");
    updatePlanMetafield(admin, appInstallationId, isPro).catch(() => {});

    return json({ isPro });
  } catch {
    const stored = await getShopPlan(session.shop);
    return json({ isPro: stored === "pro" });
  }
};

// ─── Dashboard UI ─────────────────────────────────────────────────────────────
export default function Index() {
  const { isPro } = useLoaderData<typeof loader>();

  const activeCount = WIDGETS.filter((w) => !w.proOnly || isPro).length;

  const openThemeEditor = () => {
    window.open("https://admin.shopify.com/themes/current/editor", "_blank");
  };

  return (
    <Page
      title="Dashboard"
      titleMetadata={<Badge tone="success">Installed</Badge>}
      primaryAction={
        isPro
          ? { content: "Manage subscription", url: "/app/billing" }
          : { content: "Upgrade to Pro", url: "/app/billing" }
      }
      secondaryActions={[
        { content: "Open Theme Editor", onAction: openThemeEditor },
      ]}
    >
      <BlockStack gap="500">

        {/* ── Welcome banner ─────────────────────────────────────────────── */}
        <div
          style={{
            background: "linear-gradient(135deg, #1a2035 0%, #1b3b6f 100%)",
            borderRadius: "12px",
            padding: "20px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <span style={{ fontSize: "32px", lineHeight: 1 }}>🚀</span>
            <div>
              <div
                style={{
                  color: "#ffffff",
                  fontWeight: 600,
                  fontSize: "15px",
                  marginBottom: "4px",
                }}
              >
                Welcome to Conversion Booster
              </div>
              <div style={{ color: "#94a3b8", fontSize: "13px" }}>
                Enable widgets in the Theme Editor — no code required
              </div>
            </div>
          </div>
          <Button variant="primary" tone="success" onClick={openThemeEditor}>
            Open Theme Editor
          </Button>
        </div>

        {/* ── Your Widgets ───────────────────────────────────────────────── */}
        <BlockStack gap="300">
          <InlineStack align="start" gap="200" blockAlign="center">
            <Text as="h2" variant="headingMd">
              Your Widgets
            </Text>
            <Badge tone="success">{`${activeCount} widgets`}</Badge>
          </InlineStack>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: "12px",
            }}
          >
            {WIDGETS.map((w) => {
              const isActive = !w.proOnly || isPro;
              return (
                <Card key={w.key}>
                  <InlineStack
                    align="space-between"
                    blockAlign="start"
                    wrap={false}
                  >
                    <InlineStack gap="300" blockAlign="center" wrap={false}>
                      {/* Icon box */}
                      <div
                        style={{
                          width: "44px",
                          height: "44px",
                          borderRadius: "10px",
                          background: isActive ? "#f0fdf4" : "#f5f3ff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "22px",
                          flexShrink: 0,
                        }}
                      >
                        {w.emoji}
                      </div>
                      {/* Text */}
                      <BlockStack gap="050">
                        <Text as="h3" variant="bodyMd" fontWeight="semibold">
                          {w.name}
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {w.desc}
                        </Text>
                      </BlockStack>
                    </InlineStack>
                    {/* Status badge */}
                    <div style={{ flexShrink: 0, marginLeft: "8px" }}>
                      {isActive ? (
                        <Badge tone="success">Active</Badge>
                      ) : (
                        <Badge tone="attention">Pro</Badge>
                      )}
                    </div>
                  </InlineStack>
                </Card>
              );
            })}
          </div>
        </BlockStack>

        {/* ── Overview stats ─────────────────────────────────────────────── */}
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            Overview
          </Text>
          <Layout>
            <Layout.Section variant="oneThird">
              <Card>
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" tone="subdued">
                    WIDGETS ACTIVE
                  </Text>
                  <Text as="p" variant="headingXl" fontWeight="bold">
                    {activeCount}
                  </Text>
                  <Text as="p" variant="bodySm" tone="success">
                    out of 5
                  </Text>
                </BlockStack>
              </Card>
            </Layout.Section>
            <Layout.Section variant="oneThird">
              <Card>
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" tone="subdued">
                    SETUP TIME
                  </Text>
                  <Text as="p" variant="headingXl" fontWeight="bold">
                    &lt;2 min
                  </Text>
                  <Text as="p" variant="bodySm" tone="success">
                    No code needed
                  </Text>
                </BlockStack>
              </Card>
            </Layout.Section>
            <Layout.Section variant="oneThird">
              <Card>
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" tone="subdued">
                    THEME EDITOR
                  </Text>
                  <Text as="p" variant="headingXl" fontWeight="bold">
                    Ready
                  </Text>
                  <Text as="p" variant="bodySm" tone="success">
                    All settings editable there
                  </Text>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        </BlockStack>

      </BlockStack>
    </Page>
  );
}
