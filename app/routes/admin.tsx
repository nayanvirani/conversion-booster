import {
  json,
  redirect,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  type MetaFunction,
} from "@remix-run/node";
import { createCookieSessionStorage } from "@remix-run/node";
import { useLoaderData, useActionData, Form, useNavigation } from "@remix-run/react";
import { getShops, type ShopRow } from "../admin.server";

export const meta: MetaFunction = () => [
  { title: "Admin — Conversion Booster" },
];

const adminSession = createCookieSessionStorage({
  cookie: {
    name: "__cb_admin",
    httpOnly: true,
    sameSite: "lax" as const,
    secrets: [process.env.ADMIN_SECRET || "cb-admin-secret-fallback"],
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 8,
  },
});

type LoaderData =
  | { authed: false; shops: []; error: null }
  | { authed: true; shops: ShopRow[]; error: string | null };

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await adminSession.getSession(request.headers.get("Cookie"));
  if (!session.get("authed")) {
    return json<LoaderData>({ authed: false, shops: [], error: null });
  }
  try {
    const shops = await getShops();
    return json<LoaderData>({ authed: true, shops, error: null });
  } catch (e: any) {
    return json<LoaderData>({ authed: true, shops: [], error: String(e.message) });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "login") {
    const password = form.get("password") as string;
    const secret = process.env.ADMIN_SECRET;
    if (!secret) {
      return json({ loginError: "ADMIN_SECRET env var is not set on the server." });
    }
    if (password !== secret) {
      return json({ loginError: "Incorrect password." });
    }
    const session = await adminSession.getSession();
    session.set("authed", true);
    return redirect("/admin", {
      headers: { "Set-Cookie": await adminSession.commitSession(session) },
    });
  }

  if (intent === "logout") {
    const session = await adminSession.getSession(
      request.headers.get("Cookie")
    );
    return redirect("/admin", {
      headers: { "Set-Cookie": await adminSession.destroySession(session) },
    });
  }

  return null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatExpires(ts: number | null): string {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  if (d.getFullYear() > 2100) return "No expiry";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function maskToken(token: string | null): string {
  if (!token) return "—";
  return token.slice(0, 8) + "••••••••" + token.slice(-4);
}

// ─── Login Page ───────────────────────────────────────────────────────────────

function LoginPage({ error }: { error?: string }) {
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  return (
    <div style={S.loginWrap}>
      <div style={S.loginBox}>
        <div style={S.loginLogoRow}>
          <img src="/logo.png" alt="" width={40} height={40} style={{ borderRadius: 10 }} />
          <div>
            <div style={S.loginTitle}>Conversion Booster</div>
            <div style={S.loginSub}>Admin Panel</div>
          </div>
        </div>
        <Form method="post" style={S.loginForm}>
          <input type="hidden" name="intent" value="login" />
          <label style={S.label}>Password</label>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            style={S.input}
            placeholder="Enter admin password"
          />
          {error && <div style={S.loginError}>{error}</div>}
          <button type="submit" disabled={busy} style={S.loginBtn}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </Form>
        <p style={{ fontSize: 12, color: "#7B7367", marginTop: 20, textAlign: "center" }}>
          Set <code>ADMIN_SECRET</code> in Railway Variables to configure the password.
        </p>
      </div>
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

function Dashboard({ shops, error }: { shops: ShopRow[]; error: string | null }) {
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
        <div style={S.headerRight}>
          <a href="/admin/export" style={S.exportBtn}>
            ↓ Export CSV
          </a>
          <Form method="post" style={{ display: "inline" }}>
            <input type="hidden" name="intent" value="logout" />
            <button type="submit" style={S.logoutBtn}>Sign out</button>
          </Form>
        </div>
      </header>

      <main style={S.main}>
        {/* Stats */}
        <div style={S.statsRow}>
          <StatCard label="Total Installs" value={total} color="#1B8FEA" />
          <StatCard label="Active Tokens" value={withToken} color="#1A7048" />
          <StatCard label="Expired / No Token" value={total - withToken} color="#B91C1C" />
        </div>

        {/* Error */}
        {error && (
          <div style={S.errorBanner}>
            <strong>DB Error:</strong> {error}
          </div>
        )}

        {/* Table */}
        <div style={S.card}>
          <div style={S.cardHeader}>
            <span style={S.cardTitle}>Installed Shops ({total})</span>
          </div>

          {total === 0 ? (
            <div style={S.empty}>No shops installed yet.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <Th>#</Th>
                    <Th>Shop Domain</Th>
                    <Th>Scopes</Th>
                    <Th>Session Expires</Th>
                    <Th>Access Token</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {shops.map((shop, i) => (
                    <tr key={shop.id} style={i % 2 === 0 ? S.rowEven : S.rowOdd}>
                      <Td>{i + 1}</Td>
                      <Td>
                        <a
                          href={`https://${shop.shop}/admin`}
                          target="_blank"
                          rel="noreferrer"
                          style={S.shopLink}
                        >
                          {shop.shop}
                        </a>
                      </Td>
                      <Td>
                        <span style={S.scopeTag}>
                          {shop.scope || "—"}
                        </span>
                      </Td>
                      <Td style={{ whiteSpace: "nowrap" }}>{formatExpires(shop.expires)}</Td>
                      <Td>
                        <code style={S.tokenCode}>{maskToken(shop.accessToken)}</code>
                      </Td>
                      <Td>
                        {shop.accessToken ? (
                          <span style={S.badgeGreen}>Active</span>
                        ) : (
                          <span style={S.badgeRed}>No Token</span>
                        )}
                      </Td>
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

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={S.statCard}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#7B7367", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 36, fontWeight: 800, color, letterSpacing: "-0.03em" }}>{value}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={S.th}>{children}</th>;
}

function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ ...S.td, ...style }}>{children}</td>;
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function Admin() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<{ loginError?: string }>();

  if (!data.authed) {
    return <LoginPage error={actionData?.loginError} />;
  }

  return <Dashboard shops={data.shops} error={data.error} />;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  // Login
  loginWrap: {
    minHeight: "100vh",
    background: "#F5F3EF",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
  loginBox: {
    background: "#fff",
    border: "1px solid #E3DDD5",
    borderRadius: 16,
    padding: "40px 40px 32px",
    width: 380,
    boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
  },
  loginLogoRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 28,
  },
  loginTitle: { fontSize: 16, fontWeight: 700, color: "#18150F" },
  loginSub: { fontSize: 12, color: "#7B7367" },
  loginForm: { display: "flex", flexDirection: "column", gap: 12 },
  label: { fontSize: 13, fontWeight: 600, color: "#18150F" },
  input: {
    border: "1px solid #E3DDD5",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 14,
    outline: "none",
    color: "#18150F",
    background: "#FAFAF8",
  },
  loginBtn: {
    background: "#1B8FEA",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "11px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    marginTop: 4,
  },
  loginError: {
    background: "#FEE2E2",
    color: "#B91C1C",
    borderRadius: 8,
    padding: "9px 12px",
    fontSize: 13,
    fontWeight: 500,
  },

  // Dashboard
  page: {
    minHeight: "100vh",
    background: "#F5F3EF",
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
    color: "#18150F",
  },
  header: {
    background: "#0F1C3F",
    padding: "0 32px",
    height: 56,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 12 },
  headerTitle: { fontSize: 15, fontWeight: 700, color: "#fff" },
  headerBadge: {
    background: "rgba(27,143,234,0.25)",
    color: "#4DBDFF",
    fontSize: 10,
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: 20,
    letterSpacing: "0.05em",
  },
  headerRight: { display: "flex", alignItems: "center", gap: 10 },
  exportBtn: {
    background: "#22D47E",
    color: "#0B1730",
    fontSize: 13,
    fontWeight: 700,
    padding: "7px 16px",
    borderRadius: 8,
    textDecoration: "none",
  },
  logoutBtn: {
    background: "rgba(255,255,255,0.1)",
    color: "rgba(255,255,255,0.7)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 8,
    padding: "7px 14px",
    fontSize: 13,
    cursor: "pointer",
  },
  main: { maxWidth: 1200, margin: "0 auto", padding: "32px 24px" },
  statsRow: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 28 },
  statCard: {
    background: "#fff",
    border: "1px solid #E3DDD5",
    borderRadius: 12,
    padding: "20px 24px",
  },
  errorBanner: {
    background: "#FEE2E2",
    color: "#B91C1C",
    borderRadius: 10,
    padding: "12px 16px",
    fontSize: 14,
    marginBottom: 20,
  },
  card: {
    background: "#fff",
    border: "1px solid #E3DDD5",
    borderRadius: 12,
    overflow: "hidden",
  },
  cardHeader: {
    padding: "16px 24px",
    borderBottom: "1px solid #E3DDD5",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: { fontSize: 15, fontWeight: 700, color: "#18150F" },
  empty: { padding: "48px 24px", textAlign: "center", color: "#7B7367", fontSize: 14 },

  // Table
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    padding: "11px 16px",
    textAlign: "left",
    fontSize: 11,
    fontWeight: 700,
    color: "#7B7367",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    background: "#FAFAF8",
    borderBottom: "1px solid #E3DDD5",
    whiteSpace: "nowrap",
  },
  td: { padding: "12px 16px", borderBottom: "1px solid #F0EDE9", verticalAlign: "middle" },
  rowEven: { background: "#fff" },
  rowOdd: { background: "#FAFAF8" },
  shopLink: { color: "#1B8FEA", fontWeight: 600, textDecoration: "none", fontSize: 13 },
  scopeTag: {
    display: "inline-block",
    background: "#EBF5FF",
    color: "#1B5FA8",
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 6,
    fontFamily: "ui-monospace, monospace",
  },
  tokenCode: {
    fontFamily: "ui-monospace, monospace",
    fontSize: 12,
    color: "#5B5147",
    background: "#F5F3EF",
    padding: "2px 6px",
    borderRadius: 4,
  },
  badgeGreen: {
    background: "#EBF5EF",
    color: "#1A7048",
    fontSize: 11,
    fontWeight: 700,
    padding: "2px 9px",
    borderRadius: 20,
  },
  badgeRed: {
    background: "#FEE2E2",
    color: "#B91C1C",
    fontSize: 11,
    fontWeight: 700,
    padding: "2px 9px",
    borderRadius: 20,
  },
};
