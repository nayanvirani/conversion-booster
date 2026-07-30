import { type LoaderFunctionArgs } from "@remix-run/node";
import { getShops, shopsToCSV } from "../admin.server";

// Auth is handled by Express Basic Auth middleware in server.ts
export async function loader({ request: _ }: LoaderFunctionArgs) {
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
