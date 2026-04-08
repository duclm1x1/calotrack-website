import adminCustomers from "../src/lib/server/handlers/admin-customers.js";
import adminIdentities from "../src/lib/server/handlers/admin-identities.js";
import adminMembers from "../src/lib/server/handlers/admin-members.js";
import portalBodyComposition from "../src/lib/server/handlers/portal-body-composition.js";
import portalChannelLink from "../src/lib/server/handlers/portal-channel-link.js";
import portalDashboardSummary from "../src/lib/server/handlers/portal-dashboard-summary.js";
import portalEnsureEmailDevCustomer from "../src/lib/server/handlers/portal-ensure-email-dev-customer.js";
import portalGoalPreview from "../src/lib/server/handlers/portal-goal-preview.js";
import portalMacroTracker from "../src/lib/server/handlers/portal-macro-tracker.js";
import portalStartZaloPhoneOtp from "../src/lib/server/handlers/portal-start-zalo-phone-otp.js";
import portalVerifyZaloPhoneOtp from "../src/lib/server/handlers/portal-verify-zalo-phone-otp.js";
import portal from "../src/lib/server/handlers/portal.js";
import resolveChannelContext from "../src/lib/server/handlers/resolve-channel-context.js";
import zaloClearDay from "../src/lib/server/handlers/zalo-clear-day.js";
import zaloImageAnalyze from "../src/lib/server/handlers/zalo-image-analyze.js";
import zaloNutritionEstimate from "../src/lib/server/handlers/zalo-nutrition-estimate.js";
import zaloOaControl from "../src/lib/server/handlers/zalo-oa-control.js";
import zaloOaOauthCallback from "../src/lib/server/handlers/zalo-oa-oauth-callback.js";
import zaloOaOauthStart from "../src/lib/server/handlers/zalo-oa-oauth-start.js";
import zaloOaSendCs from "../src/lib/server/handlers/zalo-oa-send-cs.js";
import zaloOaSendTemplate from "../src/lib/server/handlers/zalo-oa-send-template.js";
import zaloOaWebhook from "../src/lib/server/handlers/zalo-oa-webhook.js";
import zaloSummary from "../src/lib/server/handlers/zalo-summary.js";

function injectQueryFromDest(req: any, params: Record<string, string>) {
  req.query = { ...(req.query || {}), ...params };
}

export default async function handler(req: any, res: any) {
  const url = req.url || '';
  const path = url.split('?')[0];

  if (path === '/api/admin-customers' || path === '/api/admin-customers/') return adminCustomers(req, res);
  if (path === '/api/admin-members' || path === '/api/admin-members/') { injectQueryFromDest(req, { action: 'admin-members' }); return portal(req, res); }
  if (path === '/api/admin-identities' || path === '/api/admin-identities/') { injectQueryFromDest(req, { action: 'admin-identities' }); return portal(req, res); }
  if (path === '/api/portal-dashboard-summary' || path === '/api/portal-dashboard-summary/') { injectQueryFromDest(req, { action: 'dashboard-summary' }); return portal(req, res); }
  if (path === '/api/portal-channel-link' || path === '/api/portal-channel-link/') { injectQueryFromDest(req, { action: 'channel-link' }); return portal(req, res); }
  if (path === '/api/portal-start-zalo-phone-otp' || path === '/api/portal-start-zalo-phone-otp/') { injectQueryFromDest(req, { action: 'start-zalo-phone-otp' }); return portal(req, res); }
  if (path === '/api/portal-verify-zalo-phone-otp' || path === '/api/portal-verify-zalo-phone-otp/') { injectQueryFromDest(req, { action: 'verify-zalo-phone-otp' }); return portal(req, res); }
  if (path === '/api/public-site-config' || path === '/api/public-site-config/') { injectQueryFromDest(req, { action: 'public-site-config' }); return portal(req, res); }
  if (path === '/api/admin-portal-settings' || path === '/api/admin-portal-settings/') { injectQueryFromDest(req, { action: 'admin-portal-settings' }); return portal(req, res); }

  if (path === '/api/zalo-oa-health' || path === '/api/zalo-oa-health/') { injectQueryFromDest(req, { mode: 'health' }); return zaloOaControl(req, res); }
  if (path === '/api/zalo-oa-browserbase-state' || path === '/api/zalo-oa-browserbase-state/') { injectQueryFromDest(req, { mode: 'browserbase-state' }); return zaloOaControl(req, res); }
  if (path === '/api/zalo-oa-bootstrap' || path === '/api/zalo-oa-bootstrap/') { injectQueryFromDest(req, { mode: 'bootstrap' }); return zaloOaControl(req, res); }
  if (path === '/api/zalo-oa-force-refresh' || path === '/api/zalo-oa-force-refresh/') { injectQueryFromDest(req, { mode: 'force-refresh' }); return zaloOaControl(req, res); }
  if (path === '/api/zalo-oa-oauth/start') return zaloOaOauthStart(req, res);
  if (path === '/api/zalo-oa-oauth/callback') return zaloOaOauthCallback(req, res);

  if (path === '/api/portal-body-composition' || path === '/api/portal-body-composition/') return portalBodyComposition(req, res);
  if (path === '/api/portal-ensure-email-dev-customer' || path === '/api/portal-ensure-email-dev-customer/') return portalEnsureEmailDevCustomer(req, res);
  if (path === '/api/portal-goal-preview' || path === '/api/portal-goal-preview/') return portalGoalPreview(req, res);
  if (path === '/api/portal-macro-tracker' || path === '/api/portal-macro-tracker/') return portalMacroTracker(req, res);
  if (path === '/api/portal' || path === '/api/portal/') return portal(req, res);
  if (path === '/api/resolve-channel-context' || path === '/api/resolve-channel-context/') return resolveChannelContext(req, res);
  if (path === '/api/zalo-clear-day' || path === '/api/zalo-clear-day/') return zaloClearDay(req, res);
  if (path === '/api/zalo-image-analyze' || path === '/api/zalo-image-analyze/') return zaloImageAnalyze(req, res);
  if (path === '/api/zalo-nutrition-estimate' || path === '/api/zalo-nutrition-estimate/') return zaloNutritionEstimate(req, res);
  if (path === '/api/zalo-oa-control' || path === '/api/zalo-oa-control/') return zaloOaControl(req, res);
  if (path === '/api/zalo-oa-send-cs' || path === '/api/zalo-oa-send-cs/') return zaloOaSendCs(req, res);
  if (path === '/api/zalo-oa-send-template' || path === '/api/zalo-oa-send-template/') return zaloOaSendTemplate(req, res);
  if (path === '/api/zalo-oa-webhook' || path === '/api/zalo-oa-webhook/') return zaloOaWebhook(req, res);
  if (path === '/api/zalo-summary' || path === '/api/zalo-summary/') return zaloSummary(req, res);

  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'gateway_route_not_found', path }));
}
