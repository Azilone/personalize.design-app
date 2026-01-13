const PAYWALL_PATH = "/app/paywall";

export const isPaywallPath = (pathname: string): boolean => {
  return pathname === PAYWALL_PATH || pathname === `${PAYWALL_PATH}/`;
};
