/**
 * Calculate the reset date for the monthly cap (first of next calendar month, UTC).
 */
export const getNextMonthResetDate = (now: Date = new Date()): Date => {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  // First day of next month at 00:00:00 UTC
  return new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));
};

const MILLS_PER_USD = 1000;
const MILLS_PER_CENT = 10;

/**
 * Convert cents to USD.
 */
export const centsToUsd = (cents: number): number => cents / 100;

/**
 * Convert cents to mills (1/1000 USD).
 */
export const centsToMills = (cents: number): number => cents * MILLS_PER_CENT;

/**
 * Convert mills (1/1000 USD) to cents.
 */
export const millsToCents = (mills: number): number =>
  Math.trunc(mills / MILLS_PER_CENT);

/**
 * Convert mills (1/1000 USD) to USD.
 */
export const millsToUsd = (mills: number): number => mills / MILLS_PER_USD;

/**
 * Format a date as a human-readable reset date (e.g., "February 1, 2026").
 */
export const formatResetDate = (date: Date): string =>
  new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);

/**
 * Normalizes USD amount to cents.
 */
export const usdToCents = (amountUsd: number): number =>
  Math.max(0, Math.round(amountUsd * 100));

/**
 * Normalize USD amount to mills (1/1000 USD).
 */
export const usdToMills = (amountUsd: number): number =>
  Math.max(0, Math.round(amountUsd * MILLS_PER_USD));
