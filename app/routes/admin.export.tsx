import { type LoaderFunctionArgs } from "@remix-run/node";
import { getEnrichedShops, enrichedShopsToCSV } from "../admin.server";

// Auth handled by Express Basic Auth middleware in server.ts
export async function loader({ request: _ }: LoaderFunctionArgs) {
  const shops = await getEnrichedShops();
  const csv = enrichedShopsToCSV(shops);
  const date = new Date().toISOString().split("T")[0];
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="boostify-shops-${date}.csv"`,
    },
  });
}
