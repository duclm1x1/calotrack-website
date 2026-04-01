import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { CheckCircle2, Copy, ExternalLink, KeyRound, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { SITE_CONFIG, buildZaloAuthCallbackUrl } from "@/lib/siteConfig";

function useQueryParams() {
  const location = useLocation();
  return useMemo(() => new URLSearchParams(location.search), [location.search]);
}

function truncateMiddle(value: string, keep = 16): string {
  if (value.length <= keep * 2) {
    return value;
  }
  return `${value.slice(0, keep)}…${value.slice(-keep)}`;
}

export default function ZaloAuthCallback() {
  const location = useLocation();
  const params = useQueryParams();
  const code = params.get("code") || "";
  const error = params.get("error") || params.get("error_code") || "";
  const errorDescription = params.get("error_description") || params.get("error_reason") || "";
  const fullUrl = `${window.location.origin}${location.pathname}${location.search}`;
  const callbackUrl = buildZaloAuthCallbackUrl();
  const statusTone = code && !error
    ? "border-primary/15 bg-primary/10 text-primary"
    : "border-accent/20 bg-accent/10 text-accent";

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
      toast.success(`Đã copy ${label}.`);
    } catch {
      toast.error(`Không thể copy ${label}.`);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(249,115,22,0.08),_transparent_24%),linear-gradient(180deg,#f7fbfa_0%,#ffffff_46%,#f8fafc_100%)] px-4 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-[32px] border border-primary/10 bg-white/90 p-8 shadow-md backdrop-blur">
          <div className="mb-4 inline-flex items-center rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
            Zalo OA auth callback
          </div>
          <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.05em] text-foreground">
            Trang này chỉ dùng để nhận `code` từ Zalo OA rồi copy sang flow đổi token thủ công.
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
            Production callback của CaloTrack đi qua website domain để bỏ hẳn `localhost` và không phụ thuộc vào GET webhook của fastn8n.
            Sau khi copy được full redirect URL hoặc riêng mã `code`, operator sẽ dùng script local để đổi sang access token và refresh token.
          </p>
        </div>

        <div className={`rounded-[32px] border p-6 shadow-sm ${statusTone}`}>
          <div className="flex items-start gap-3">
            {code && !error ? <CheckCircle2 className="mt-1 h-5 w-5" /> : <XCircle className="mt-1 h-5 w-5" />}
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em]">Callback state</div>
              <div className="mt-2 text-2xl font-semibold text-foreground">
                {code && !error ? "Đã nhận authorization code" : "Chưa có code hợp lệ"}
              </div>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                {code && !error
                  ? "Bước tiếp theo là copy full redirect URL hoặc copy riêng code rồi chạy script đổi token."
                  : error
                    ? `Zalo trả về lỗi: ${error}${errorDescription ? ` - ${errorDescription}` : ""}`
                    : "Nếu bạn mở trang này trực tiếp mà chưa đi qua permission URL của Zalo thì sẽ chưa có query param code."}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-6">
            <div className="rounded-[32px] border border-primary/10 bg-white/90 p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Authorization code</div>
                  <div className="mt-3 break-all text-lg font-semibold text-foreground">
                    {code || "Chưa có"}
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
              <div className="mt-4 rounded-2xl border border-border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
                {code
                  ? `Mã này sẽ được đổi sang token cho app ${SITE_CONFIG.zaloAppId}.`
                  : "Mã sẽ xuất hiện ở đây sau khi OA admin cấp quyền bằng permission URL đúng production callback."}
              </div>
            </div>

            <div className="rounded-[32px] border border-primary/10 bg-white/90 p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Full redirect URL</div>
                  <div className="mt-3 break-all text-sm leading-6 text-foreground">{fullUrl}</div>
                </div>
                <Button type="button" variant="outline" onClick={() => copyValue(fullUrl, "redirect URL")}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy URL
                </Button>
              </div>
            </div>

            <div className="rounded-[32px] border border-primary/10 bg-white/90 p-6 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Production callback URL</div>
              <div className="mt-3 break-all text-sm leading-6 text-foreground">{callbackUrl}</div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button type="button" variant="outline" onClick={() => copyValue(callbackUrl, "callback URL")}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy callback URL
                </Button>
                <a
                  href={`https://oauth.zaloapp.com/v4/oa/permission?app_id=${encodeURIComponent(
                    SITE_CONFIG.zaloAppId,
                  )}&redirect_uri=${encodeURIComponent(callbackUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button type="button">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Mở OA permission URL
                  </Button>
                </a>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[32px] border border-primary/10 bg-primary/5 p-6 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <KeyRound className="h-4 w-4" />
                Bước đổi token thủ công
              </div>
              <pre className="mt-4 overflow-x-auto rounded-2xl border border-primary/10 bg-white/85 p-4 text-xs leading-6 text-foreground">
                {`python "E:\\Antigravity\\CaloTrack\\Calo Track Website\\tools\\exchange_zalo_oa_token.py" --secret "<rotated_secret>" --redirect-url "${fullUrl}"`}
              </pre>
              <Button
                type="button"
                className="mt-4 w-full"
                onClick={() =>
                  copyValue(
                    `python "E:\\Antigravity\\CaloTrack\\Calo Track Website\\tools\\exchange_zalo_oa_token.py" --secret "<rotated_secret>" --redirect-url "${fullUrl}"`,
                    "token exchange command",
                  )
                }
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy command
              </Button>
            </div>

            <div className="rounded-[32px] border border-primary/10 bg-white/90 p-6 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <ShieldCheck className="h-4 w-4" />
                n8n variables cần set
              </div>
              <pre className="mt-4 overflow-x-auto rounded-2xl border border-border bg-muted/40 p-4 text-xs leading-6 text-foreground">
                {`ZALO_APP_ID=${SITE_CONFIG.zaloAppId}
ZALO_OA_SECRET_KEY=<rotated_secret>
ZALO_OA_ACCESS_TOKEN=<access_token>
ZALO_OA_REFRESH_TOKEN=<refresh_token>
ZALO_OA_TOKEN_EXPIRES_AT=<expires_at>`}
              </pre>
              <div className="mt-4 text-sm leading-6 text-muted-foreground">
                Fastn8n hiện không đáng tin cho GET callback production, nên route này chỉ giúp operator lấy code sạch trên production domain.
              </div>
            </div>

            <div className="rounded-[32px] border border-accent/15 bg-accent/5 p-6 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">Sanity check</div>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
                <li>App ID: <span className="font-medium text-foreground">{SITE_CONFIG.zaloAppId}</span></li>
                <li>OA URL: <span className="break-all font-medium text-foreground">{SITE_CONFIG.zaloOaUrl}</span></li>
                <li>Redirect URL hiện tại: <span className="break-all font-medium text-foreground">{truncateMiddle(fullUrl)}</span></li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
