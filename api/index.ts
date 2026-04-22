type RequestLike = {
  url?: string;
  query?: Record<string, string>;
};

type Handler = (req: any, res: any) => Promise<unknown> | unknown;

function injectQueryFromDest(req: RequestLike, params: Record<string, string>) {
  req.query = { ...(req.query || {}), ...params };
}

async function resolveHandler(loader: () => Promise<any>): Promise<Handler> {
  const mod = await loader();
  const handler = mod.default;
  return handler as Handler;
}

const loadAdminCustomers = () => import("../src/lib/server/handlers/admin-customers.js");
const loadAdminPayments = () => import("../src/lib/server/handlers/admin-payments.js");
const loadEgressSend = () => import("../src/lib/server/handlers/egress-send.js");
const loadGatewayDispatch = () => import("../src/lib/server/handlers/gateway-dispatch.js");
const loadIngressTelegram = () => import("../src/lib/server/handlers/ingress-telegram.js");
const loadIngressZalo = () => import("../src/lib/server/handlers/ingress-zalo.js");
const loadPortalBodyComposition = () => import("../src/lib/server/handlers/portal-body-composition.js");
const loadPortalEnsureEmailDevCustomer = () => import("../src/lib/server/handlers/portal-ensure-email-dev-customer.js");
const loadPortalGoalPreview = () => import("../src/lib/server/handlers/portal-goal-preview.js");
const loadPortalMacroTracker = () => import("../src/lib/server/handlers/portal-macro-tracker.js");
const loadPortalOrderStatus = () => import("../src/lib/server/handlers/portal-order-status.js");
const loadPortal = () => import("../src/lib/server/handlers/portal.js");
const loadResolveChannelContext = () => import("../src/lib/server/handlers/resolve-channel-context.js");
const loadSepayWebhook = () => import("../src/lib/server/handlers/sepay-webhook.js");
const loadZaloClearDay = () => import("../src/lib/server/handlers/zalo-clear-day.js");
const loadZaloDomainVerifier = () => import("../src/lib/server/handlers/zalo-domain-verifier.js");
const loadZaloImageAnalyze = () => import("../src/lib/server/handlers/zalo-image-analyze.js");
const loadZaloMediaProxy = () => import("../src/lib/server/handlers/zalo-media-proxy.js");
const loadZaloNutritionEstimate = () => import("../src/lib/server/handlers/zalo-nutrition-estimate.js");
const loadZaloOaControl = () => import("../src/lib/server/handlers/zalo-oa-control.js");
const loadZaloOaOauthCallback = () => import("../src/lib/server/handlers/zalo-oa-oauth-callback.js");
const loadZaloOaOauthStart = () => import("../src/lib/server/handlers/zalo-oa-oauth-start.js");
const loadZaloOaSendCs = () => import("../src/lib/server/handlers/zalo-oa-send-cs.js");
const loadZaloOaSendTemplate = () => import("../src/lib/server/handlers/zalo-oa-send-template.js");
const loadZaloOaWebhook = () => import("../src/lib/server/handlers/zalo-oa-webhook.js");
const loadZaloRetention = () => import("../src/lib/server/handlers/zalo-retention.js");
const loadZaloSummary = () => import("../src/lib/server/handlers/zalo-summary.js");
const loadZaloWater = () => import("../src/lib/server/handlers/zalo-water.js");

export default async function handler(req: any, res: any) {
  const url = req.url || "";
  const path = url.split("?")[0];

  if (path === "/api/admin-customers" || path === "/api/admin-customers/") {
    return (await resolveHandler(loadAdminCustomers))(req, res);
  }
  if (path === "/api/admin-payments" || path === "/api/admin-payments/") {
    return (await resolveHandler(loadAdminPayments))(req, res);
  }
  if (path === "/api/egress-send" || path === "/api/egress-send/") {
    return (await resolveHandler(loadEgressSend))(req, res);
  }
  if (path === "/api/gateway-dispatch" || path === "/api/gateway-dispatch/") {
    return (await resolveHandler(loadGatewayDispatch))(req, res);
  }
  if (path === "/api/ingress-telegram" || path === "/api/ingress-telegram/") {
    return (await resolveHandler(loadIngressTelegram))(req, res);
  }
  if (path === "/api/ingress-zalo" || path === "/api/ingress-zalo/") {
    return (await resolveHandler(loadIngressZalo))(req, res);
  }
  if (path === "/api/admin-members" || path === "/api/admin-members/") {
    injectQueryFromDest(req, { action: "admin-members" });
    return (await resolveHandler(loadPortal))(req, res);
  }
  if (path === "/api/admin-identities" || path === "/api/admin-identities/") {
    injectQueryFromDest(req, { action: "admin-identities" });
    return (await resolveHandler(loadPortal))(req, res);
  }
  if (path === "/api/portal-dashboard-summary" || path === "/api/portal-dashboard-summary/") {
    injectQueryFromDest(req, { action: "dashboard-summary" });
    return (await resolveHandler(loadPortal))(req, res);
  }
  if (path === "/api/portal-notification-settings" || path === "/api/portal-notification-settings/") {
    injectQueryFromDest(req, { action: "notification-settings" });
    return (await resolveHandler(loadPortal))(req, res);
  }
  if (path === "/api/portal-start-checkout" || path === "/api/portal-start-checkout/") {
    injectQueryFromDest(req, { action: "start-checkout" });
    return (await resolveHandler(loadPortal))(req, res);
  }
  if (path === "/api/portal-channel-link" || path === "/api/portal-channel-link/") {
    injectQueryFromDest(req, { action: "channel-link" });
    return (await resolveHandler(loadPortal))(req, res);
  }
  if (path === "/api/portal-automation-reconcile" || path === "/api/portal-automation-reconcile/") {
    injectQueryFromDest(req, { action: "automation-reconcile" });
    return (await resolveHandler(loadPortal))(req, res);
  }
  if (path === "/api/portal-start-zalo-phone-otp" || path === "/api/portal-start-zalo-phone-otp/") {
    injectQueryFromDest(req, { action: "start-zalo-phone-otp" });
    return (await resolveHandler(loadPortal))(req, res);
  }
  if (path === "/api/portal-verify-zalo-phone-otp" || path === "/api/portal-verify-zalo-phone-otp/") {
    injectQueryFromDest(req, { action: "verify-zalo-phone-otp" });
    return (await resolveHandler(loadPortal))(req, res);
  }
  if (path === "/api/portal-redeem-claim-code" || path === "/api/portal-redeem-claim-code/") {
    injectQueryFromDest(req, { action: "redeem-zalo-claim-code" });
    return (await resolveHandler(loadPortal))(req, res);
  }
  if (path === "/api/portal-complete-phone-onboarding" || path === "/api/portal-complete-phone-onboarding/") {
    injectQueryFromDest(req, { action: "complete-phone-onboarding" });
    return (await resolveHandler(loadPortal))(req, res);
  }
  if (path === "/api/zalo-auth-bridge" || path === "/api/zalo-auth-bridge/") {
    injectQueryFromDest(req, { action: "zalo-auth-bridge" });
    return (await resolveHandler(loadPortal))(req, res);
  }
  if (path === "/api/public-site-config" || path === "/api/public-site-config/") {
    injectQueryFromDest(req, { action: "public-site-config" });
    return (await resolveHandler(loadPortal))(req, res);
  }
  if (path === "/api/portal-order-status" || path === "/api/portal-order-status/") {
    return (await resolveHandler(loadPortalOrderStatus))(req, res);
  }
  if (path === "/api/admin-portal-settings" || path === "/api/admin-portal-settings/") {
    injectQueryFromDest(req, { action: "admin-portal-settings" });
    return (await resolveHandler(loadPortal))(req, res);
  }
  if (path === "/api/sepay-webhook" || path === "/api/sepay-webhook/") {
    return (await resolveHandler(loadSepayWebhook))(req, res);
  }

  if (path === "/api/zalo-oa-health" || path === "/api/zalo-oa-health/") {
    injectQueryFromDest(req, { mode: "health" });
    return (await resolveHandler(loadZaloOaControl))(req, res);
  }
  if (path === "/api/zalo-oa-browserbase-state" || path === "/api/zalo-oa-browserbase-state/") {
    injectQueryFromDest(req, { mode: "browserbase-state" });
    return (await resolveHandler(loadZaloOaControl))(req, res);
  }
  if (path === "/api/zalo-oa-bootstrap" || path === "/api/zalo-oa-bootstrap/") {
    injectQueryFromDest(req, { mode: "bootstrap" });
    return (await resolveHandler(loadZaloOaControl))(req, res);
  }
  if (path === "/api/zalo-oa-force-refresh" || path === "/api/zalo-oa-force-refresh/") {
    injectQueryFromDest(req, { mode: "force-refresh" });
    return (await resolveHandler(loadZaloOaControl))(req, res);
  }
  if (path.startsWith("/api/zalo-oa-oauth/start/zalo_verifier") && path.endsWith(".html")) {
    return (await resolveHandler(loadZaloDomainVerifier))(req, res);
  }
  if (path === "/api/zalo-oa-oauth/start" || path === "/api/zalo-oa-oauth/start/") {
    return (await resolveHandler(loadZaloOaOauthStart))(req, res);
  }
  if (path === "/api/zalo-oa-oauth/callback" || path === "/api/zalo-oa-oauth/callback/") {
    return (await resolveHandler(loadZaloOaOauthCallback))(req, res);
  }

  if (path === "/api/portal-body-composition" || path === "/api/portal-body-composition/") {
    return (await resolveHandler(loadPortalBodyComposition))(req, res);
  }
  if (path === "/api/portal-ensure-email-dev-customer" || path === "/api/portal-ensure-email-dev-customer/") {
    return (await resolveHandler(loadPortalEnsureEmailDevCustomer))(req, res);
  }
  if (path === "/api/portal-goal-preview" || path === "/api/portal-goal-preview/") {
    return (await resolveHandler(loadPortalGoalPreview))(req, res);
  }
  if (path === "/api/portal-macro-tracker" || path === "/api/portal-macro-tracker/") {
    return (await resolveHandler(loadPortalMacroTracker))(req, res);
  }
  if (path === "/api/portal" || path === "/api/portal/") {
    return (await resolveHandler(loadPortal))(req, res);
  }
  if (path === "/api/resolve-channel-context" || path === "/api/resolve-channel-context/") {
    return (await resolveHandler(loadResolveChannelContext))(req, res);
  }
  if (path === "/api/zalo-clear-day" || path === "/api/zalo-clear-day/") {
    return (await resolveHandler(loadZaloClearDay))(req, res);
  }
  if (path === "/api/zalo-image-analyze" || path === "/api/zalo-image-analyze/") {
    return (await resolveHandler(loadZaloImageAnalyze))(req, res);
  }
  if (path === "/api/zalo-media-proxy" || path === "/api/zalo-media-proxy/") {
    return (await resolveHandler(loadZaloMediaProxy))(req, res);
  }
  if (path === "/api/zalo-nutrition-estimate" || path === "/api/zalo-nutrition-estimate/") {
    return (await resolveHandler(loadZaloNutritionEstimate))(req, res);
  }
  if (path === "/api/zalo-oa-control" || path === "/api/zalo-oa-control/") {
    return (await resolveHandler(loadZaloOaControl))(req, res);
  }
  if (path === "/api/zalo-oa-send-cs" || path === "/api/zalo-oa-send-cs/") {
    return (await resolveHandler(loadZaloOaSendCs))(req, res);
  }
  if (path === "/api/zalo-oa-send-template" || path === "/api/zalo-oa-send-template/") {
    return (await resolveHandler(loadZaloOaSendTemplate))(req, res);
  }
  if (path === "/api/zalo-oa-webhook" || path === "/api/zalo-oa-webhook/") {
    return (await resolveHandler(loadZaloOaWebhook))(req, res);
  }
  if (path === "/api/zalo-retention-health" || path === "/api/zalo-retention-health/") {
    injectQueryFromDest(req, { action: "health" });
    return (await resolveHandler(loadZaloRetention))(req, res);
  }
  if (path === "/api/zalo-retention" || path === "/api/zalo-retention/") {
    return (await resolveHandler(loadZaloRetention))(req, res);
  }
  if (path === "/api/zalo-summary" || path === "/api/zalo-summary/") {
    return (await resolveHandler(loadZaloSummary))(req, res);
  }
  if (path === "/api/zalo-water" || path === "/api/zalo-water/") {
    return (await resolveHandler(loadZaloWater))(req, res);
  }

  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: "gateway_route_not_found", path }));
}
