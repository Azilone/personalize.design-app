import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("./routes/_index/route.tsx"),
  route("auth/login", "./routes/auth/login/route.tsx"),
  route("auth/exit-iframe", "./routes/auth/exit-iframe/route.tsx"),
  route("auth/session-token", "./routes/auth/session-token/route.tsx"),
  route("auth/*", "./routes/auth/$/route.tsx"),
  route("inngest", "./routes/inngest/route.tsx"),
  route("app-proxy", "./routes/app-proxy/route.tsx"),
  route("api/inngest", "./routes/inngest/route.tsx", {
    id: "routes/inngest/api",
  }),
  route(
    "webhooks/app/scopes_update",
    "./routes/webhooks/app/scopes_update/route.tsx",
  ),
  route(
    "webhooks/app/uninstalled",
    "./routes/webhooks/app/uninstalled/route.tsx",
  ),
  route("app", "./routes/app/route.tsx", { id: "routes/app" }, [
    index("./routes/app/_index/route.tsx"),
    route("billing", "./routes/app/billing/route.tsx"),
    route("billing/confirm", "./routes/app/billing/confirm/route.tsx"),
    route("dev", "./routes/app/dev/route.tsx"),
    route(
      "onboarding/spend-safety",
      "./routes/app/onboarding/spend-safety/route.tsx",
    ),
    route(
      "onboarding/storefront-personalization",
      "./routes/app/onboarding/storefront-personalization/route.tsx",
    ),
    route("paywall", "./routes/app/paywall/route.tsx"),
    route("printify", "./routes/app/printify/route.tsx"),
    route("readiness", "./routes/app/readiness/route.tsx"),
    route("settings", "./routes/app/settings/route.tsx"),
    route("storefront", "./routes/app/storefront/route.tsx"),
    route("templates", "./routes/app/templates/_index/route.tsx"),
    route("templates/new", "./routes/app/templates/new/route.tsx"),
    route(
      "templates/:templateId",
      "./routes/app/templates/$templateId/route.tsx",
    ),
    route("products", "./routes/app/products/_index/route.tsx"),
    route("products/:productId", "./routes/app/products/$productId/route.tsx"),
    route("api/preview/:jobId", "./routes/app/api/preview/$jobId/route.ts"),
  ]),
] satisfies RouteConfig;
