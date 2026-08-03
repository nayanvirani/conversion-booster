import { json, type ActionFunctionArgs, type LoaderFunctionArgs, type MetaFunction } from "@remix-run/node";
import { useActionData, useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import { clearPermanentSessions, getEnrichedShops, migrateOfflineTokens, type EnrichedShop, type MigrationResult } from "../admin.server";

export const meta: MetaFunction = () => [{ title: "Admin — Boostify" }];

export async function loader({ request: _ }: LoaderFunctionArgs) {
  try {
    const shops = await getEnrichedShops();
    return json({ shops, error: null as string | null });
  } catch (e: any) {
    return json({ shops: [] as EnrichedShop[], error: String(e.message) });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const form   = await request.formData();
  const intent = form.get("intent");

  if (intent === "clear") {
    const { cleared } = await clearPermanentSessions();
    return json({ cleared });
  }

  // default: attempt Shopify token exchange
  const results = await migrateOfflineTokens();
  return json({ migration: results });
}

export default function Admin() {
  const { shops, error } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const submit = useSubmit();
  const isMigrating  = nav.state === "submitting";
  const isClearing   = isMigrating && (nav.formData?.get("intent") === "clear");

  const total      = shops.length;
  const withTok    = shops.filter((s) => s.accessToken).length;
  const proCount   = shops.filter((s) => s.isPro).length;
  const trialCount = shops.filter((s) => s.trialActive).length;
  const freeCount  = total - proCount;
  const mrr        = proCount * 9.99;
  const needsMigration = shops.some((s) => s.accessToken && !(s as any).refreshToken);

  return (
    <div style={S.page}>
      {/* Header */}
      <header style={S.header}>
        <div style={S.headerLeft}>
          <img src="/logo.png" alt="" width={32} height={32} style={{ borderRadius: 8 }} />
          <span style={S.headerTitle}>Boostify</span>
          <span style={S.headerBadge}>Admin</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <a href="/admin/export" style={S.exportBtn}>↓ Export CSV</a>
          <button onClick={() => (window as any).handleLogout()} style={S.logoutBtn}>Sign out</button>
        </div>
      </header>
      <script dangerouslySetInnerHTML={{ __html: `
        function handleLogout() {
          var xhr = new XMLHttpRequest();
          xhr.open('GET', '/admin-logout', false, '__logout__', '__logout__');
          try { xhr.send(); } catch(e) {}
          window.location.replace('/');
        }
      `}} />

      <main style={S.main}>
        {/* Stats */}
        <div style={S.statsRow}>
          <StatCard label="Total Installs"  value={total}               color="#1B8FEA" />
          <StatCard label="Active Tokens"   value={withTok}             color="#1A7048" />
          <StatCard label="Pro Subscribers" value={proCount}            color="#7C3AED" />
          <StatCard label="Free Users"      value={freeCount}           color="#B45309" />
          <StatCard label="On Trial"        value={trialCount}          color="#0E7490" />
          <StatCard
            label="MRR"
            value={`$${mrr.toFixed(2)}`}
            color="#15803D"
            isText
          />
        </div>

        {/* Session cleared confirmation */}
        {actionData && "cleared" in actionData && (
          <div style={{ ...S.warnBanner, background: "#EBF5EF", borderColor: "#BBF7D0", color: "#1A7048" }}>
            <div>
              <strong>✓ {(actionData as any).cleared} session(s) cleared.</strong>{" "}
              Now ask the merchant to open the app in Shopify admin — Token Exchange will run automatically and issue a new expiring token.
              The Shopify Monitoring warning should clear within 24 hours.
            </div>
          </div>
        )}

        {/* Migration result banner */}
        {actionData && "migration" in actionData && (
          <MigrationResults results={(actionData as any).migration} onClear={() => submit({ intent: "clear" }, { method: "post" })} isClearing={isClearing} />
        )}

        {/* Migration needed banner */}
        {!actionData && needsMigration && (
          <div style={S.warnBanner}>
            <span>⚠️ <strong>Fix overdue:</strong> {withTok} shop(s) use deprecated permanent offline tokens.</span>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button style={S.migrateBtn} disabled={isMigrating}
                onClick={() => submit({}, { method: "post" })}>
                {isMigrating ? "Trying…" : "Try exchange"}
              </button>
              <button style={{ ...S.migrateBtn, background: "#B91C1C" }} disabled={isMigrating}
                onClick={() => submit({ intent: "clear" }, { method: "post" })}>
                {isClearing ? "Clearing…" : "Clear & force re-auth"}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div style={S.errorBanner}>
            <strong>Database error:</strong> {error}
          </div>
        )}

        {/* Table */}
        <div style={S.card}>
          <div style={S.cardHeader}>
            <span style={S.cardTitle}>Installed Shops ({total})</span>
            <span style={{ fontSize: 12, color: "#7B7367" }}>Data fetched live from Shopify API</span>
          </div>
          {total === 0 ? (
            <div style={S.empty}>
              {error ? "Could not load shops — check DATABASE_URL in Railway." : "No shops installed yet."}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={S.table}>
                <thead>
                  <tr>
                    {["#", "Store Name", "Shop Domain", "Owner", "Email", "Plan", "Token", "Session Expires"].map((h) => (
                      <th key={h} style={S.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shops.map((shop, i) => (
                    <tr key={shop.id} style={i % 2 === 0 ? S.rowEven : S.rowOdd}>
                      <td style={S.td}>{i + 1}</td>
                      <td style={S.td}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>
                          {shop.storeName ?? <span style={{ color: "#aaa" }}>—</span>}
                        </span>
                      </td>
                      <td style={S.td}>
                        <a
                          href={`https://${shop.shop}/admin`}
                          target="_blank"
                          rel="noreferrer"
                          style={S.shopLink}
                        >
                          {shop.shop}
                        </a>
                      </td>
                      <td style={S.td}>
                        {shop.ownerName || <span style={{ color: "#aaa" }}>—</span>}
                      </td>
                      <td style={S.td}>
                        {shop.ownerEmail
                          ? <a href={`mailto:${shop.ownerEmail}`} style={S.mailLink}>{shop.ownerEmail}</a>
                          : <span style={{ color: "#aaa" }}>—</span>}
                      </td>
                      <td style={S.td}>
                        <PlanBadge shop={shop} />
                      </td>
                      <td style={S.td}>
                        {shop.accessToken
                          ? <span style={S.badgeGreen}>Active</span>
                          : <span style={S.badgeRed}>No Token</span>}
                      </td>
                      <td style={{ ...S.td, whiteSpace: "nowrap" as const, color: "#7B7367", fontSize: 12 }}>
                        {formatExpires(shop.expires)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p style={{ fontSize: 11, color: "#AAA49C", marginTop: 16, textAlign: "center" }}>
          Live data is fetched via Shopify Admin API on each page load using the stored access token.
          Billing status on dev stores shows Free (Shopify restriction).
        </p>
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MigrationResults({ results, onClear, isClearing }: {
  results: MigrationResult[];
  onClear: () => void;
  isClearing: boolean;
}) {
  const migrated = results.filter((r) => r.status === "migrated").length;
  const failed   = results.filter((r) => r.status === "failed").length;
  const already  = results.filter((r) => r.status === "already_expiring").length;
  const success  = migrated > 0 || (failed === 0 && already > 0);

  return (
    <div style={{ ...S.warnBanner, background: success ? "#EBF5EF" : "#FEE2E2", borderColor: success ? "#BBF7D0" : "#FECACA", color: success ? "#1A7048" : "#B91C1C", marginBottom: 20, alignItems: "flex-start" }}>
      <div style={{ flex: 1 }}>
        <strong>Token exchange result.</strong>{" "}
        {migrated > 0 && <span>✓ {migrated} migrated. Monitoring warning clears in ~24h. </span>}
        {already > 0 && <span>✓ {already} already using expiring tokens. </span>}
        {failed > 0 && (
          <>
            <span>✗ {failed} failed — Cloudflare blocked the server-to-server call.</span>
            {results.filter((r) => r.status === "failed").map((r, i) => (
              <div key={i} style={{ marginTop: 4, fontFamily: "monospace", fontSize: 11, wordBreak: "break-all" }}>
                {r.shop}: {r.error}
              </div>
            ))}
            <div style={{ marginTop: 10, fontSize: 13 }}>
              Use <strong>"Clear & force re-auth"</strong> instead — it deletes the old session so the next app visit issues a new expiring token automatically.
            </div>
          </>
        )}
      </div>
      {failed > 0 && (
        <button style={{ ...S.migrateBtn, background: "#B91C1C", marginTop: 2 }} disabled={isClearing} onClick={onClear}>
          {isClearing ? "Clearing…" : "Clear & force re-auth"}
        </button>
      )}
    </div>
  );
}

function PlanBadge({ shop }: { shop: EnrichedShop }) {
  if (!shop.accessToken) return <span style={S.badgeGray}>No Token</span>;
  if (shop.apiError)     return <span style={S.badgeGray}>API Error</span>;
  if (shop.isPro && shop.trialActive) return <span style={S.badgePurple}>Trial</span>;
  if (shop.isPro)        return <span style={S.badgePurple}>Pro</span>;
  return <span style={S.badgeOrange}>Free</span>;
}

function StatCard({
  label, value, color, isText,
}: {
  label: string; value: number | string; color: string; isText?: boolean;
}) {
  return (
    <div style={S.statCard}>
      <div style={S.statLabel}>{label}</div>
      <div style={{ fontSize: isText ? 28 : 38, fontWeight: 800, color, letterSpacing: "-0.03em", marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatExpires(ts: string | number | null): string {
  if (!ts) return "—";
  const d = new Date(Number(ts) * 1000);
  if (isNaN(d.getTime())) return "—";
  if (d.getFullYear() > 2100) return "No expiry";
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh", background: "#F5F3EF",
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
    color: "#18150F",
  },
  header: {
    background: "#0F1C3F", padding: "0 32px", height: 56,
    display: "flex", alignItems: "center", justifyContent: "space-between",
    position: "sticky", top: 0, zIndex: 10,
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 12 },
  headerTitle: { fontSize: 15, fontWeight: 700, color: "#fff" },
  headerBadge: {
    background: "rgba(27,143,234,0.25)", color: "#4DBDFF",
    fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, letterSpacing: "0.05em",
  },
  exportBtn: {
    background: "#22D47E", color: "#0B1730", fontSize: 13, fontWeight: 700,
    padding: "7px 18px", borderRadius: 8, textDecoration: "none",
  },
  logoutBtn: {
    background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.65)",
    border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8,
    padding: "7px 14px", fontSize: 13, cursor: "pointer",
  },
  main: { maxWidth: 1280, margin: "0 auto", padding: "32px 24px" },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(6, 1fr)",
    gap: 12,
    marginBottom: 28,
  },
  statCard: {
    background: "#fff", border: "1px solid #E3DDD5", borderRadius: 12, padding: "18px 20px",
  },
  statLabel: {
    fontSize: 11, fontWeight: 700, color: "#7B7367",
    textTransform: "uppercase" as const, letterSpacing: "0.06em",
  },
  errorBanner: {
    background: "#FEE2E2", color: "#B91C1C", borderRadius: 10,
    padding: "12px 16px", fontSize: 14, marginBottom: 20,
  },
  warnBanner: {
    background: "#FEF3C7", color: "#92400E", borderRadius: 10,
    border: "1px solid #FDE68A",
    padding: "14px 18px", fontSize: 14, marginBottom: 20,
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
  },
  migrateBtn: {
    background: "#B45309", color: "#fff", border: "none",
    borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700,
    cursor: "pointer", flexShrink: 0,
  },
  card: { background: "#fff", border: "1px solid #E3DDD5", borderRadius: 12, overflow: "hidden" },
  cardHeader: {
    padding: "16px 24px", borderBottom: "1px solid #E3DDD5",
    display: "flex", alignItems: "center", justifyContent: "space-between",
  },
  cardTitle: { fontSize: 15, fontWeight: 700 },
  empty: { padding: "48px 24px", textAlign: "center", color: "#7B7367", fontSize: 14 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    padding: "11px 14px", textAlign: "left", fontSize: 11, fontWeight: 700,
    color: "#7B7367", textTransform: "uppercase", letterSpacing: "0.06em",
    background: "#FAFAF8", borderBottom: "1px solid #E3DDD5", whiteSpace: "nowrap",
  },
  td: { padding: "11px 14px", borderBottom: "1px solid #F0EDE9", verticalAlign: "middle" },
  rowEven: { background: "#fff" },
  rowOdd: { background: "#FAFAF8" },
  shopLink: { color: "#1B8FEA", fontWeight: 600, textDecoration: "none", fontSize: 12 },
  mailLink: { color: "#1B8FEA", textDecoration: "none", fontSize: 12 },
  badgeGreen:  { background: "#EBF5EF", color: "#1A7048",  fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 20 },
  badgeRed:    { background: "#FEE2E2", color: "#B91C1C",  fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 20 },
  badgePurple: { background: "#EDE9FE", color: "#6D28D9",  fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 20 },
  badgeOrange: { background: "#FEF3C7", color: "#B45309",  fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 20 },
  badgeGray:   { background: "#F3F4F6", color: "#6B7280",  fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 20 },
};
