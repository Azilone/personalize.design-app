import { useLoaderData } from "react-router";

import { authenticate } from "../../shopify.server";

export const loader = async ({ request }: { request: Request }) => {
  await authenticate.public.appProxy(request);

  const url = new URL(request.url);

  return {
    shop: url.searchParams.get("shop"),
    loggedInCustomerId: url.searchParams.get("logged_in_customer_id"),
  };
};

export default function AppProxy() {
  const { shop, loggedInCustomerId } = useLoaderData<typeof loader>();

  return (
    <div>
      {`Hello from personalize.design (${
        loggedInCustomerId || "not-logged-in"
      }) on ${shop}`}
    </div>
  );
}
