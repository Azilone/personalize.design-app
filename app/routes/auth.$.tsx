import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    return await authenticate.admin(request);
  } catch (error) {
    // For bounce/exit-iframe flows Shopify throws a Response that must be returned
    // directly (not rendered inside our SSR shell), otherwise App Bridge won't run.
    if (error instanceof Response) {
      return error;
    }

    throw error;
  }
};

export default function AuthRoute() {
  return null;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
