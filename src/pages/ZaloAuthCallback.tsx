import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { CheckCircle2, Copy, ExternalLink, KeyRound, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  SITE_CONFIG,
  buildSiteUrl,
  buildZaloAuthCallbackUrl,
  buildZaloOauthCallbackApiUrl,
  buildZaloOauthStartUrl,
} from "@/lib/siteConfig";

function useQueryParams() {
  const location = useLocation();
  return useMemo(() => new URLSearchParams(location.search), [location.search]);
}

function truncateMiddle(value: string, keep = 16) {
  if (value.length <= keep * 2) {
    return value;
  }
  return `${value.slice(0, keep)}...${value.slice(-keep)}`;
}

export default function ZaloAuthCallback() {
  const location = useLocation();
  const params = useQueryParams();
  const code = params.get("code") || "";
  const error = params.get("error") || params.get("error_code") || "";
  const errorDescription = params.get("error_description") || params.get("error_reason") || "";
  const fullUrl = `${window.location.origin}${location.pathname}${location.search}`;
  const legacyCallbackUrl = buildZaloAuthCallbackUrl();
  const oauthStartUrl = buildZaloOauthStartUrl();
  const oauthCallbackApiUrl = buildZaloOauthCallbackApiUrl();
  const legacyBootstrapUrl = buildSiteUrl("/api/zalo-oa-bootstrap");

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => {
      document.head.removeChild(meta);
    };
  }, []);

  async function copyValue(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`Da copy ${label}.`);
    } catch {
      toast.error(`Khong the copy ${label}.`);
    }
  }

  const statusTone = code && !error
    ? "border-primary/15 bg-primary/10 text-primary"
    : "border-accent/20 bg-accent/10 text-accent";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(249,115,22,0.08),_transparent_24%),linear-gradient(180deg,#f7fbfa_0%,#ffffff_46%,#f8fafc_100%)] px-4 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-[32px] border border-primary/10 bg-white/90 p-8 shadow-md backdrop-blur">
          <div className="mb-4 inline-flex items-center rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
            Zalo OA auth recovery
          </div>
          <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.05em] text-foreground">
            OAuth callback chinh da chay tren server, khong con exchange token tren client.
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
            Route production dung de recover token la OAuth callback server-side cua CaloTrack.
            Trang nay chi duoc giu lai de debug lane cu, doc query params, va huong operator ve
            OAuth start URL chinh thuc.
          </p>
        </div>

        <div className={`rounded-[32px] border p-6 shadow-sm ${statusTone}`}>
          <div className="flex items-start gap-3">
            {code && !error ? <CheckCircle2 className="mt-1 h-5 w-5" /> : <XCircle className="mt-1 h-5 w-5" />}
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em]">Callback state</div>
              <div className="mt-2 text-2xl font-semibold text-foreground">
                {code && !error ? "Client page da nhan authorization code" : "Khong co code hop le tren client page"}
              </div>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                {code && !error
                  ? "Neu callback URL trong Zalo Developer dang tro nham vao client page nay, hay doi ve OAuth callback server-side de broker bootstrap tu dong."
                  : error
                    ? `Zalo tra ve loi: ${error}${errorDescription ? ` - ${errorDescription}` : ""}.`
                    : "Neu ban mo trang nay truc tiep thi se chua co query param code. Production callback dung phai la /api/zalo-oa-oauth/callback."}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-6">
            <div className="rounded-[32px] border border-primary/10 bg-white/90 p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Authorization code on legacy page</div>
                  <div className="mt-3 break-all text-lg font-semibold text-foreground">
                    {code || "Chua co"}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => copyValue(code, "authorization code")}
                  disabled={!code}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy code
                </Button>
              </div>
            </div>

            <div className="rounded-[32px] border border-primary/10 bg-white/90 p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Full redirect URL on legacy page</div>
                  <div className="mt-3 break-all text-sm leading-6 text-foreground">{fullUrl}</div>
                </div>
                <Button type="button" variant="outline" onClick={() => copyValue(fullUrl, "legacy redirect URL")}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy URL
                </Button>
              </div>
            </div>

            <div className="rounded-[32px] border border-primary/10 bg-white/90 p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Production OAuth callback URL</div>
                  <div className="mt-3 break-all text-sm leading-6 text-foreground">{oauthCallbackApiUrl}</div>
                </div>
                <Button type="button" variant="outline" onClick={() => copyValue(oauthCallbackApiUrl, "OAuth callback URL")}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy callback URL
                </Button>
              </div>
              <div className="mt-4 rounded-2xl border border-accent/10 bg-accent/5 p-4 text-sm leading-6 text-muted-foreground">
                Day moi la callback URL can dang ky trong Zalo Developers. Server se validate
                state, exchange code, bootstrap broker, roi redirect ve trang success/failure don gian.
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button type="button" variant="outline" onClick={() => copyValue(oauthStartUrl, "OAuth start URL")}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy start URL
                </Button>
                <a href={oauthStartUrl} target="_blank" rel="noopener noreferrer">
                  <Button type="button">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Mo OAuth start URL
                  </Button>
                </a>
              </div>
            </div>

            <div className="rounded-[32px] border border-primary/10 bg-white/90 p-6 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Legacy client callback URL</div>
              <div className="mt-3 break-all text-sm leading-6 text-foreground">{legacyCallbackUrl}</div>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                Chi giu lai de debug. Khong dung URL nay trong Zalo Developers neu muon OAuth bootstrap
                chay tu dong vao broker.
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[32px] border border-primary/10 bg-primary/5 p-6 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <KeyRound className="h-4 w-4" />
                Buoc 1: bat dau OAuth dung lane production
              </div>
              <pre className="mt-4 overflow-x-auto rounded-2xl border border-primary/10 bg-white/85 p-4 text-xs leading-6 text-foreground">
                {oauthStartUrl}
              </pre>
              <Button type="button" className="mt-4 w-full" onClick={() => copyValue(oauthStartUrl, "OAuth start URL")}>
                <Copy className="mr-2 h-4 w-4" />
                Copy OAuth start URL
              </Button>
            </div>

            <div className="rounded-[32px] border border-primary/10 bg-white/90 p-6 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <ShieldCheck className="h-4 w-4" />
                Buoc 2: server tu bootstrap token store
              </div>
              <pre className="mt-4 overflow-x-auto rounded-2xl border border-border bg-muted/40 p-4 text-xs leading-6 text-foreground">
                {`GET ${oauthStartUrl}
  -> redirect toi Zalo permission URL
  -> callback ve ${oauthCallbackApiUrl}
  -> server exchange code + bootstrap broker`}
              </pre>
              <Button type="button" variant="outline" className="mt-4 w-full" onClick={() => copyValue(legacyBootstrapUrl, "legacy bootstrap API URL")}>
                <Copy className="mr-2 h-4 w-4" />
                Copy legacy bootstrap API URL
              </Button>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                Route bootstrap POST van duoc giu lai cho emergency/manual lane, nhung production recovery
                uu tien OAuth callback server-side. Runtime tiep tuc dung refresh token rotation trong token
                store chung va khong dung access token tinh trong n8n hay env.
              </p>
            </div>

            <div className="rounded-[32px] border border-accent/15 bg-accent/5 p-6 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">Sanity check</div>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
                <li>App ID: <span className="font-medium text-foreground">{SITE_CONFIG.zaloAppId}</span></li>
                <li>OA URL: <span className="break-all font-medium text-foreground">{SITE_CONFIG.zaloOaUrl}</span></li>
                <li>Redirect URL hien tai: <span className="break-all font-medium text-foreground">{truncateMiddle(fullUrl)}</span></li>
                <li>OAuth start: <span className="break-all font-medium text-foreground">{oauthStartUrl}</span></li>
                <li>OAuth callback: <span className="break-all font-medium text-foreground">{oauthCallbackApiUrl}</span></li>
                <li>Legacy bootstrap API: <span className="break-all font-medium text-foreground">{legacyBootstrapUrl}</span></li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
