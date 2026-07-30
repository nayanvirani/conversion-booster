import { type LoaderFunctionArgs } from "@remix-run/node";
import { createCookieSessionStorage } from "@remix-run/node";
import { getShops, shopsToCSV } from "../admin.server";

const adminSession = createCookieSessionStorage({
  cookie: {
    name: "__cb_admin",
    httpOnly: true,
    sameSite: "lax" as const,
    secrets: [process.env.ADMIN_SECRET || "cb-admin-secret-fallback"],
    secure: process.env.NODE_ENV === "production",
  },
});

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await adminSession.getSession(request.headers.get("Cookie"));
  if (!session.get("authed")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const shops = await getShops();
  const csv = shopsToCSV(shops);
  const date = new Date().toISOString().split("T")[0];

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cb-shops-${date}.csv"`,
    },
  });
}
