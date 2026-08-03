import { json, type ActionFunctionArgs } from "@remix-run/node";
import { migrateOfflineTokens } from "../admin.server";

// Auth handled by Express Basic Auth middleware
export async function action({ request: _ }: ActionFunctionArgs) {
  const results = await migrateOfflineTokens();
  return json({ results });
}

// GET not supported — redirect to admin
export async function loader() {
  return new Response(null, { status: 303, headers: { Location: "/admin" } });
}
