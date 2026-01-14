import { redirect } from "react-router";
import { getPrintifyIntegration } from "./integration.server";
import { buildEmbeddedSearch } from "../../lib/embedded-search";

/**
 * Use this in Printify-required flows to ensure a Printify shop is selected.
 * Redirects to the Printify setup page if no integration exists.
 *
 * @example
 * ```ts
 * export const loader = async ({ request }: LoaderFunctionArgs) => {
 *   const { session } = await authenticate.admin(request);
 *   const shopId = getShopIdFromSession(session);
 *   const integration = await requirePrintifyIntegration(shopId, request);
 *   // integration is guaranteed to exist here
 * };
 * ```
 */
export const requirePrintifyIntegration = async (
  shopId: string,
  request: Request,
) => {
  const integration = await getPrintifyIntegration(shopId);

  if (!integration) {
    const embeddedSearch = buildEmbeddedSearch(new URL(request.url).search);
    throw redirect(`/app/printify${embeddedSearch}`);
  }

  return integration;
};
