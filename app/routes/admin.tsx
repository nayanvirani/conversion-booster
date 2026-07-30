import { json, type LoaderFunctionArgs, type MetaFunction } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { getShops, type ShopRow } from "../admin.server";

export const meta: MetaFunction = () => [
  { title: "Admin — Conversion Booster" },
];

export async function loader({ request: _ }: LoaderFunctionArgs) {
  // Auth is handled by Express Basic Auth middleware — if we reach here, user is authenticated.
  try {
    const shops = await getShops();
    return json({ shops, error: null as string | null });
  } catch (e: any) {
    return json({ shops: [] as ShopRow[], error: String(e.message) });
  }
}

export default function Admin() {
  const { shops, error } = useLoaderData<typeof loader>();
  const total = shops.length;
  const withToken = shops.filter((s) => s.accessToken).length;

  return (
    <div style={S.page}>
      {/* Header */}
      <header style={S.header}>
        <div style={S.headerLeft}>
          <img src="/logo.png" alt="" width={32} height={32} style={{ borderRadius: 8 }} />
          <span style={S.headerTitle}>Conversion Booster</span>
          <span style={S.headerBadge}>Admin</span>
        </div>
        <a href="/admin/export" style={S.exportBtn}>↓ Export CSV</a>
      </header>

      <main style={S.main}>
        {/* Stats */}
        <div style={S.statsRow}>
          <StatCard label="Total Installs" value={total} color="#1B8FEA" />
          <StatCard label="Active Tokens" value={withToken} color="#1A7048" />
          <StatCard label="No Token" value={total - withToken} color="#B91C1C" />
        </div>

        {error && (
          <div style={S.errorBanner}>
            <strong>Database not connected.</strong>{" "}
            {error.includes("DATABASE_URL")
              ? "Add a PostgreSQL service in Railway and link its DATABASE_URL variable to this app service, then redeploy."
              : error}
          </div>
        )}

        {/* Table */}
        <div style={S.card}>
          <div style={S.cardHeader}>
            <span style={S.cardTitle}>Installed Shops ({total})</span>
            <span style={{ fontSize: 12, color: "#7B7367" }}>Offline sessions only</span>
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
                    {["#", "Shop Domain", "Scopes", "Expires", "Access Token", "Status"].map((h) => (
                      <th key={h} style={S.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shops.map((shop, i) => (
                    <tr key={shop.id} style={i % 2 === 0 ? S.rowEven : S.rowOdd}>
                      <td style={S.td}>{i + 1}</td>
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
                        <span style={S.scopeTag}>{shop.scope || "—"}</span>
                      </td>
                      <td style={{ ...S.td, whiteSpace: "nowrap" as const }}>
                        {formatExpires(shop.expires)}
                      </td>
                      <td style={S.td}>
                        <code style={S.tokenCode}>{maskToken(shop.accessToken)}</code>
                      </td>
                      <td style={S.td}>
                        {shop.accessToken
                          ? <span style={S.badgeGreen}>Active</span>
                          : <span style={S.badgeRed}>No Token</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatExpires(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "—";
  if (d.getFullYear() > 2100) return "No expiry";
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function maskToken(token: string | null): string {
  if (!token) return "—";
  return token.slice(0, 6) + "••••••••" + token.slice(-4);
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={S.statCard}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#7B7367", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 38, fontWeight: 800, color, letterSpacing: "-0.03em" }}>{value}</div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

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
  main: { maxWidth: 1200, margin: "0 auto", padding: "32px 24px" },
  statsRow: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 28 },
  statCard: {
    background: "#fff", border: "1px solid #E3DDD5", borderRadius: 12, padding: "20px 24px",
  },
  errorBanner: {
    background: "#FEE2E2", color: "#B91C1C", borderRadius: 10,
    padding: "12px 16px", fontSize: 14, marginBottom: 20,
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
    padding: "11px 16px", textAlign: "left", fontSize: 11, fontWeight: 700,
    color: "#7B7367", textTransform: "uppercase", letterSpacing: "0.06em",
    background: "#FAFAF8", borderBottom: "1px solid #E3DDD5", whiteSpace: "nowrap",
  },
  td: { padding: "12px 16px", borderBottom: "1px solid #F0EDE9", verticalAlign: "middle" },
  rowEven: { background: "#fff" },
  rowOdd: { background: "#FAFAF8" },
  shopLink: { color: "#1B8FEA", fontWeight: 600, textDecoration: "none", fontSize: 13 },
  scopeTag: {
    display: "inline-block", background: "#EBF5FF", color: "#1B5FA8",
    fontSize: 11, padding: "2px 8px", borderRadius: 6, fontFamily: "ui-monospace, monospace",
  },
  tokenCode: {
    fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#5B5147",
    background: "#F5F3EF", padding: "2px 6px", borderRadius: 4,
  },
  badgeGreen: { background: "#EBF5EF", color: "#1A7048", fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 20 },
  badgeRed: { background: "#FEE2E2", color: "#B91C1C", fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 20 },
};
