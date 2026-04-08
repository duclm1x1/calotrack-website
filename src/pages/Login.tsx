import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, MessageCircle, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useAuth } from "@/contexts/AuthContext";
import { portalStartPhoneAuth, portalVerifyPhoneOtp } from "@/lib/portalApi";
import { SITE_CONFIG } from "@/lib/siteConfig";

function normalizeNextPath(value: string | null): string {
  const next = String(value || "").trim();
  if (!next.startsWith("/")) {
    return SITE_CONFIG.dashboardPath;
  }
  if (next.startsWith("//") || next.startsWith("/api/")) {
    return SITE_CONFIG.dashboardPath;
  }
  return next;
}

function describeAuthIssue(error: unknown): string | null {
  const message = String((error as Error)?.message || error || "").toLowerCase();
  if (message.includes("otp_cooldown_active")) {
    return "Bạn vừa yêu cầu mã quá nhanh. Hãy chờ một chút rồi thử lại.";
  }
  if (message.includes("zalo_otp_send_failed") || message.includes("otp_delivery_failed")) {
    return "Không thể gửi mã qua Zalo lúc này. Hãy thử lại sau ít phút hoặc liên hệ hỗ trợ.";
  }
  return null;
}

export default function Login() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [phoneInput, setPhoneInput] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpValue, setOtpValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [authIssue, setAuthIssue] = useState<string | null>(null);
  const [phoneHelper, setPhoneHelper] = useState(
    "Nhập số điện thoại đã dùng Zalo để nhận OTP, xác thực account và mở trial 7 ngày.",
  );

  const nextPath = useMemo(
    () => normalizeNextPath(searchParams.get("next")),
    [searchParams],
  );

  useEffect(() => {
    if (user) {
      navigate(nextPath, { replace: true });
    }
  }, [navigate, nextPath, user]);

  async function handleSendOtp(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setAuthIssue(null);

    try {
      const result = await portalStartPhoneAuth(phoneInput);
      setPhoneInput(result.phoneE164);
      setPhoneHelper(result.helperText);

      if (result.status === "fallback_required") {
        setOtpSent(false);
        setAuthIssue(result.helperText);
        toast.error(result.helperText);
        return;
      }

      setOtpSent(true);
      toast.success("Mã xác thực đã được gửi qua Zalo tới số điện thoại của bạn.");
    } catch (error) {
      const nextIssue = describeAuthIssue(error);
      if (nextIssue) {
        setAuthIssue(nextIssue);
      }
      toast.error(String((error as Error)?.message || "Không thể gửi mã xác thực lúc này."));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);

    try {
      const result = await portalVerifyPhoneOtp(phoneInput, otpValue);
      if (result.accessState === "trialing") {
        toast.success("Xác thực thành công. Trial 7 ngày đã được kích hoạt cho tài khoản của bạn.");
      } else {
        toast.success("Xác thực số điện thoại thành công.");
      }
      navigate(nextPath, { replace: true });
    } catch (error) {
      toast.error(String((error as Error)?.message || "OTP chưa đúng hoặc đã hết hạn."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(249,115,22,0.08),_transparent_24%),linear-gradient(180deg,#f7fbfa_0%,#ffffff_46%,#f8fafc_100%)] px-4 py-10">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.05fr_420px]">
        <div className="rounded-[32px] border border-primary/10 bg-white/82 p-8 shadow-md backdrop-blur">
          <div className="mb-4 inline-flex items-center rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
            Xác thực tài khoản
          </div>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.05em] text-foreground">
            Xác thực số điện thoại qua Zalo để mở trial và dùng chung trên portal, Zalo, Telegram.
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
            Public onboarding của CaloTrack là phone-first. Sau khi OTP thành công, hệ thống sẽ tạo hoặc
            nối customer truth, mở trial 7 ngày và giữ entitlement đồng bộ giữa portal, Zalo, Telegram.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <span className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
              OTP gửi qua Zalo
            </span>
            <span className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
              Trial 7 ngày chỉ mở sau khi verify
            </span>
            <span className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
              Một customer truth dùng chung cho web và chat
            </span>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-primary/10 bg-primary/5 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                Bước 1
              </div>
              <div className="mt-2 text-lg font-semibold text-foreground">Nhập số điện thoại</div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Dùng đúng số điện thoại đã nhận tin từ OA CaloTrack trên Zalo.
              </p>
            </div>
            <div className="rounded-3xl border border-primary/10 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                Bước 2
              </div>
              <div className="mt-2 text-lg font-semibold text-foreground">Nhận OTP trên Zalo</div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Hệ thống gửi mã xác thực tới đúng OA để giảm lệch entitlement giữa các kênh.
              </p>
            </div>
            <div className="rounded-3xl border border-accent/15 bg-accent/5 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                Bước 3
              </div>
              <div className="mt-2 text-lg font-semibold text-foreground">Mở trial và tiếp tục</div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Verify xong là có thể quay lại checkout, vào dashboard hoặc mở chat ngay.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[32px] border border-primary/10 bg-white/90 p-8 shadow-md backdrop-blur">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-foreground">Đăng nhập bằng số điện thoại</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Nhập số điện thoại để nhận OTP qua Zalo. Sau khi verify, hệ thống sẽ tự mở trial 7 ngày
              và đưa bạn về đúng bước đang làm.
            </p>
          </div>

          {!otpSent ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Số điện thoại</label>
                <Input
                  type="tel"
                  inputMode="tel"
                  placeholder="Ví dụ 0912345678"
                  value={phoneInput}
                  onChange={(event) => setPhoneInput(event.target.value)}
                  required
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  Nếu bạn đang đi từ checkout, gói đã chọn sẽ được giữ lại sau khi OTP thành công.
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={loading || !phoneInput.trim()}>
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Smartphone className="mr-2 h-4 w-4" />
                )}
                Gửi mã qua Zalo
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="rounded-2xl border border-primary/10 bg-primary/5 p-4 text-sm text-muted-foreground">
                Mã xác thực đã được gửi qua Zalo tới{" "}
                <span className="font-semibold text-foreground">{phoneInput}</span>.
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Nhập mã xác thực</label>
                <InputOTP
                  maxLength={6}
                  value={otpValue}
                  onChange={setOtpValue}
                  containerClassName="justify-start"
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <div className="flex gap-3">
                <Button type="submit" className="flex-1" disabled={loading || otpValue.length < 6}>
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Smartphone className="mr-2 h-4 w-4" />
                  )}
                  Xác thực và tiếp tục
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setOtpSent(false);
                    setOtpValue("");
                  }}
                >
                  Đổi số
                </Button>
              </div>
              
              <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-primary/10 bg-white p-4 text-center">
                <p className="text-sm font-medium text-foreground">Bạn chưa nhận được mã?</p>
                <p className="text-xs text-muted-foreground">
                  Mở ứng dụng Zalo của bạn và kiểm tra tin nhắn từ OA CaloTrack để lấy mã OTP nhé.
                </p>
                <Button variant="secondary" asChild className="mt-2 w-full gap-2">
                  <a href={SITE_CONFIG.zaloOaUrl} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="h-4 w-4 text-[#0068FF]" />
                    Truy cập Zalo
                  </a>
                </Button>
              </div>
            </form>
          )}

          <div className="mt-4 rounded-2xl border border-primary/10 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">
            {authIssue || phoneHelper}
          </div>

          {SITE_CONFIG.publicEmailDevPortalEnabled ? (
            <div className="mt-6 rounded-2xl border border-dashed border-border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
              Internal-only fallback đang bật. Public flow vẫn phải đi qua số điện thoại và OTP trên Zalo.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
