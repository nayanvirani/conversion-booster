// Shared helpers for reading and writing the current plan status.
// The plan metafield on the app installation is the source of truth
// for theme extensions — Liquid reads `app.metafields.boostify.plan`
// to decide whether to render Pro-only widgets.

/**
 * Write the current plan to the app installation metafield so that
 * Liquid theme extensions can gate Pro-only widgets.
 *
 * Called after every plan determination (billing page, home page).
 * Fire-and-forget on the home page; awaited on the billing page.
 */
export async function updatePlanMetafield(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  appInstallationId: string,
  isPro: boolean
): Promise<void> {
  if (!appInstallationId) return;
  try {
    const result = await admin.graphql(
      `#graphql
      mutation SetPlanMetafield($ownerId: ID!, $value: String!) {
        metafieldsSet(metafields: [{
          ownerId: $ownerId
          namespace: "boostify"
          key: "plan"
          value: $value
          type: "single_line_text_field"
        }]) {
          metafields { id key value }
          userErrors { field message }
        }
      }`,
      { variables: { ownerId: appInstallationId, value: isPro ? "pro" : "free" } }
    );
    const body = await result.json();
    const errors = body.data?.metafieldsSet?.userErrors ?? [];
    if (errors.length) {
      console.error("[plan] metafieldsSet userErrors:", errors);
    } else {
      console.log(`[plan] metafield boostify.plan = "${isPro ? "pro" : "free"}"`);
    }
  } catch (err) {
    console.error("[plan] metafieldsSet mutation failed:", err);
  }
}
