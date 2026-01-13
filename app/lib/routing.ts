const PAYWALL_PATH = "/app/paywall";

export const isPaywallPath = (pathname: string): boolean => {
  return pathname === PAYWALL_PATH || pathname === `${PAYWALL_PATH}/`;
};

const EMBEDDED_QUERY_KEYS = ["host", "embedded", "shop", "locale"] as const;

export const buildEmbeddedRedirectPath = (
  request: Request,
  pathname: string,
): string => {
  const requestUrl = new URL(request.url);
  const targetUrl = new URL(pathname, requestUrl.origin);

  for (const key of EMBEDDED_QUERY_KEYS) {
    const value = requestUrl.searchParams.get(key);
    if (value) {
      targetUrl.searchParams.set(key, value);
    }
  }

  return `${targetUrl.pathname}${targetUrl.search}`;
};
