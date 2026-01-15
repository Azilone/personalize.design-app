# Double Refresh Issue - Investigation Log

**Date Created:** 2026-01-15  
**Issue:** Moving between Setup (`/app`) and Templates (`/app/templates`) pages causes a double refresh, visible in server logs as repeated `React Router │ [shopify-app/INFO] Authenticating admin request` entries.

---

## Problem Description

When navigating from Setup to Templates (or vice versa), the page appears to refresh twice. Server logs show:

```
React Router │ [shopify-app/INFO] Authenticating admin request | {shop: personalized-design-dev-store.myshopify.com}
```

This happens on every navigation between these routes, causing a perceived double refresh/flash.

---

## Environment

- **Runtime:** Node.js (>=20.19 <22 || >=22.12)
- **Language:** TypeScript ^5.9.3
- **Framework:** Shopify React Router template (react-router ^7.12.0, @shopify/shopify-app-react-router ^1.1.0)
- **React:** ^18.3.1
- **Data:** Prisma ^6.16.3 with Supabase Postgres
- **Authentication:** Shopify Admin API (GraphQL-only)

---

## Investigation History

### Test 1: Navigation Component Analysis

**Date:** 2026-01-15  
**Finding:** The app shell (`app/routes/app/route.tsx`) uses React Router's `<Link>` component for navigation, not raw `<a href>` anchors.

```tsx
<s-app-nav>
  <Link to={`/app${embeddedSearch}`}>Setup</Link>
  <Link to={`/app/templates${embeddedSearch}`}>Templates</Link>
  ...
</s-app-nav>
```

**Result:** Links are correctly using React Router `<Link>`, so this is not the cause.

---

### Test 2: s-link Custom Element Usage

**Date:** 2026-01-15  
**Finding:** Several routes were using custom `<s-link>` elements instead of React Router `<Link>`:

- `app/routes/app/_index/route.tsx`
- `app/routes/app/additional/route.tsx`
- `app/routes/app/onboarding/spend-safety/route.tsx`
- `app/routes/app/onboarding/storefront-personalization/route.tsx`
- `app/routes/app/printify/route.tsx`

**Action Taken:** Migrated all `<s-link>` elements to React Router `<Link>` components with proper `rel="noopener noreferrer"` for external links.

**Result:** Fixed 5 files, but double refresh persists.

---

### Test 3: shouldRevalidate Hook Analysis

**Date:** 2026-01-15  
**Finding:** The `shouldRevalidate` hook in `app/routes/app/route.tsx:138-163` was returning `false` for same-app navigation:

```tsx
export const shouldRevalidate: ShouldRevalidateFunction = ({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}) => {
  if (formMethod) {
    return defaultShouldRevalidate;
  }

  const navigatingWithinApp =
    currentUrl.pathname.startsWith("/app") &&
    nextUrl.pathname.startsWith("/app");
  const paywallTransition =
    isPaywallPath(currentUrl.pathname) || isPaywallPath(nextUrl.pathname);

  if (
    navigatingWithinApp &&
    !paywallTransition &&
    currentUrl.pathname !== nextUrl.pathname
  ) {
    return false; // <-- This was causing the issue
  }

  return defaultShouldRevalidate;
};
```

**Theory:** When `shouldRevalidate` returns `false`, React Router skips loader re-validation. However, the Shopify admin authentication middleware (`authenticate.admin`) in loaders still runs on every request, triggering re-authentication twice per navigation.

**Action Taken:** Removed the custom `shouldRevalidate` logic, reverting to default behavior.

**Result:** Double refresh persists. Further investigation needed.

---

### Test 4: Request Tracing Implementation

**Date:** 2026-01-15
**Action:** Added request ID tracing to loaders to identify if double auth logs are from:

1. Two separate HTTP requests hitting the server
2. One request logged twice
3. A redirect chain causing multiple requests

**Files Modified:**

- `app/routes/app/route.tsx` - Added START/END trace logs to app shell loader
- `app/routes/app/templates/_index/route.tsx` - Added START/END trace logs to templates list loader

**Trace Pattern:**

```tsx
const requestId = crypto.randomUUID();
console.log(`[${requestId}] [TRACE] START App shell loader: ${request.url}`);
// ... loader code ...
console.log(`[${requestId}] [TRACE] END App shell loader: ${request.url}`);
```

**Purpose:** Request IDs allow matching START/END logs to specific requests. If we see:

- Same ID → Single request, auth logged twice
- Different IDs → Two separate requests hitting server

**Next:** Navigate between Setup/Templates and check console logs to determine root cause.

---

## Related Files Analyzed

| File                                                             | Purpose                               | Status                              |
| ---------------------------------------------------------------- | ------------------------------------- | ----------------------------------- |
| `app/routes/app/route.tsx`                                       | App shell with navigation             | Modified (shouldRevalidate removed) |
| `app/routes/app/_index/route.tsx`                                | Setup page                            | Fixed (s-link → Link)               |
| `app/routes/app/templates/_index/route.tsx`                      | Templates list page                   | Already using Link                  |
| `app/routes/app/templates/$templateId/route.tsx`                 | Template edit page                    | Already using Link                  |
| `app/routes/app/additional/route.tsx`                            | Sandbox page                          | Fixed (s-link → Link)               |
| `app/routes/app/onboarding/spend-safety/route.tsx`               | Spend safety onboarding               | Fixed (s-link → Link)               |
| `app/routes/app/onboarding/storefront-personalization/route.tsx` | Storefront personalization onboarding | Fixed (s-link → Link)               |
| `app/routes/app/printify/route.tsx`                              | Printify setup                        | Fixed (s-link → Link)               |
| `app/root.tsx`                                                   | Root HTML template                    | No issues found                     |
| `app/entry.server.tsx`                                           | Server entry point                    | No issues found                     |
| `app/shopify.server.ts`                                          | Shopify authentication config         | No issues found                     |
| `app/lib/embedded-search.ts`                                     | Embedded query param handling         | No issues found                     |
| `app/lib/routing.ts`                                             | Routing utilities                     | No issues found                     |

---

## Remaining Theories

1. **Shopify Admin Authentication Middleware**  
   The `authenticate.admin` function in loaders may be running multiple times per navigation, even when loaders are skipped. This could be inherent to how the Shopify React Router template handles authentication.

2. **React Router v7 + Shopify App Bridge Interaction**  
   The combination of React Router v7 with Shopify's App Bridge in embedded mode may have edge cases causing double authentication.

3. **App Provider/Embedded App Behavior**  
   The `<AppProvider embedded>` component may trigger re-authentication when URL params change (host, embedded, shop, locale).

4. **Browser/Shopify iframe Navigation**  
   The embedded app runs inside a Shopify iframe. Navigation within the iframe may trigger Shopify's top-level navigation detection.

---

## Next Steps

- [x] Add detailed client-side timing logs to measure actual refresh duration
- [ ] **TEST:** Navigate between Setup/Templates and capture console logs with request IDs
- [ ] Analyze if double auth logs show same request ID (duplicate logging) or different IDs (two requests)
- [ ] Based on trace results, implement appropriate fix (redirect handling, loader optimization, or App Bridge configuration)
- [ ] Test navigation with different browser (ruling out extension interference)
- [ ] Test in incognito/private mode
- [ ] Check Shopify App Bridge version compatibility with React Router v7
- [ ] Review Shopify React Router template issues for known navigation problems
- [ ] Test without embedded query params (host, shop, etc.)
- [ ] Compare behavior between dev mode and production build

---

## Commands Used

```bash
# Lint check
npm run lint

# TypeScript type check
npm run typecheck

# Run tests
npm run test

# Development server
npm run dev
```

---

## Notes

- The app uses `buildEmbeddedSearch()` to preserve query params (host, embedded, shop, locale) across navigations. This is critical for embedded apps but may contribute to issue.
- All routes correctly use React Router's `<Link>` component as of fix.
- The `shouldRevalidate` change was committed but did not resolve the issue.
- Request tracing implemented with unique IDs to distinguish duplicate logging from multiple requests.
- Test 4 added diagnostic tracing to `app/routes/app/route.tsx` and `app/routes/app/templates/_index/route.tsx`.

---

**Last Updated:** 2026-01-15 15:30 UTC
