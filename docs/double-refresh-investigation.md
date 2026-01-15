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

---

### Test 5: Request Tracing Results & Fix

**Date:** 2026-01-15
**Finding:** User provided console logs showing two separate requests with different UUIDs:

1. **Request #1** (`c0dd5bd8`): Basic embedded params only
   - URL: `?host=...&embedded=1&shop=...&locale=fr`
2. **Request #2** (`3a2c84fa`): Additional App Bridge session params
   - URL: `?embedded=1&hmac=...&host=...&id_token=...&locale=fr&session=...&shop=...&timestamp=...`
   - Extra params: `hmac`, `id_token`, `session`, `timestamp`

**Root Cause Confirmed:** Navigation with only embedded params (`host`, `embedded`, `shop`, `locale`) loses Shopify App Bridge session params. App Bridge detects missing/stale session params and triggers a redirect to refresh them, causing:

- Two HTTP requests per navigation
- Two `authenticate.admin` calls
- Perceived "double refresh" in UI

**Fix Applied:** Updated app shell navigation to preserve ALL query params, not just embedded ones.

**Files Modified:**

- `app/routes/app/route.tsx` - Changed from `buildEmbeddedSearch()` to full `search` string in navigation
- `app/routes/app/route.tsx` - Removed unused `buildEmbeddedSearch` import
- `app/routes/app/route.tsx` - Removed diagnostic trace logs (START/END)
- `app/routes/app/templates/_index/route.tsx` - Removed diagnostic trace logs (START/END)

**Implementation:**

```tsx
// Before
const embeddedSearch = buildEmbeddedSearch(search);
<Link to={`/app${embeddedSearch}`}>Setup</Link>;

// After
const query = search ? `?${search}` : "";
<Link to={`/app${query}`}>Setup</Link>;
```

**Expected Result:** Single HTTP request per navigation, no double refresh.

**Result:** ❌ FIX FAILED - Double refresh still occurring after applying this change.

**Analysis:** Preserving all query params didn't resolve the issue. The problem may be deeper:

1. `useLocation().search` may not include ALL params present in browser URL
2. Shopify App Bridge may be forcing a full page reload regardless of params
3. React Router navigation in embedded mode may be incompatible with Shopify's iframe behavior

**Next:** Test 6 - Investigate if App Bridge is forcing full page reloads.

---

### Test 6: Programmatic Navigation with Dynamic Param Reading

**Date:** 2026-01-15  
**Approach:** Based on research findings, test these alternatives:

1. **Read URL params dynamically at click time** instead of using stale `useLocation().search` from render time
2. **Use `useNavigate()` with programmatic navigation** instead of declarative `<Link>` components
3. **Add request deduplication** to prevent rapid duplicate navigations

**Theory:**

- `useLocation().search` captures URL params when component renders
- App Bridge may add session params (`hmac`, `id_token`, `session`, `timestamp`) AFTER render
- By reading `window.location.search` at click time, we get the most recent URL state
- Using `useNavigate()` gives more control than declarative links

**Files Modified:**

- `app/routes/app/route.tsx` - Added `useNavigate` import
- `app/routes/app/route.tsx` - Changed navigation from `<Link>` to click handlers
- `app/routes/app/route.tsx` - Added request deduplication (200ms debounce)

**Implementation:**

```tsx
// Before
<Link to={`/app${query}`}>Setup</Link>

// After
<Link to="/app" onClick={(e) => {
  e.preventDefault();
  handleNavigate("/app");
}}>Setup</Link>

const handleNavigate = (to: string) => {
  const now = Date.now();
  if (now - lastNavTime < 200) return; // Dedup
  lastNavTime = now;

  const currentSearch = window.location.search;
  const query = currentSearch ? `${to}${currentSearch}` : to;
  navigate(query);
};
```

**Next:** Test navigation between Setup/Templates to verify if this approach resolves double refresh.

---

## Next Steps

- [x] Add detailed client-side timing logs to measure actual refresh duration
- [x] **TEST:** Navigate between Setup/Templates and capture console logs with request IDs
- [x] Analyze if double auth logs show same request ID (duplicate logging) or different IDs (two requests)
- [x] Based on trace results, implement appropriate fix (redirect handling, loader optimization, or App Bridge configuration)
- [ ] **TEST:** Navigate between Setup/Templates to verify only one request hits server
- [ ] Test navigation with different browser (ruling out extension interference)
- [ ] Test in incognito/private mode

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

- The app previously used `buildEmbeddedSearch()` to preserve only 4 query params (host, embedded, shop, locale) across navigations. This caused loss of App Bridge session params.
- All routes correctly use React Router's `<Link>` component as of fix.
- The `shouldRevalidate` change was committed but did not resolve the issue.
- Request tracing implemented with unique IDs to distinguish duplicate logging from multiple requests (Test 4).
- Test 5 identified root cause: App Bridge redirect due to missing session params.
- Fix 5 (preserve all params) FAILED - double refresh still occurred.
- Test 6: Using programmatic navigation with dynamic param reading to capture latest URL state at click time.
- Added request deduplication (200ms debounce) to prevent rapid duplicate navigations.

---

**Last Updated:** 2026-01-15 17:30 UTC
