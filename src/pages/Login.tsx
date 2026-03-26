import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Smartphone, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useAuth } from "@/contexts/AuthContext";
import { portalStartPhoneAuth, portalVerifyPhoneOtp } from "@/lib/portalApi";
import { SITE_CONFIG, getPrimaryChannelHref } from "@/lib/siteConfig";

export default function Login() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [phoneInput, setPhoneInput] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpValue, setOtpValue] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      navigate(SITE_CONFIG.dashboardPath, { replace: true });
    }
  }, [navigate, user]);

  async function handleSendOtp(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const result = await portalStartPhoneAuth(phoneInput);
      setPhoneInput(result.phoneE164);
      setOtpSent(true);
      toast.success("Mã OTP đã được gửi tới số điện thoại của bạn.");
    } catch (error) {
      toast.error(String((error as Error)?.message || "Không thể gửi OTP lúc này."));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      await portalVerifyPhoneOtp(phoneInput, otpValue);
      toast.success("Xác thực số điện thoại thành công.");
      navigate(SITE_CONFIG.dashboardPath, { replace: true });
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
            Phone-first customer portal
          </div>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.05em] text-foreground">
            Vào CaloTrack bằng số điện thoại để thanh toán, kích hoạt và dùng ngay trên Telegram.
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
            Portal này không còn là màn hình “beta” để tham khảo. Đây là lớp account thật cho login, checkout, activation,
            payment và trạng thái link Telegram/Zalo, với entitlement luôn nằm ở customer theo phone.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-primary/10 bg-primary/5 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Account model</div>
              <div className="mt-2 text-lg font-semibold text-foreground">Phone canonical</div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Một số điện thoại giữ plan, quota và shared entitlement cho toàn bộ Telegram, Zalo và portal web.
              </p>
            </div>
            <div className="rounded-3xl border border-primary/10 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Live channel</div>
              <div className="mt-2 text-lg font-semibold text-foreground">{SITE_CONFIG.primaryChannelLabel}</div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Kênh tracking live mạnh nhất hiện tại và là lựa chọn nhanh nhất để dùng ngay sau khi gói active.
              </p>
            </div>
            <div className="rounded-3xl border border-accent/15 bg-accent/5 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Zalo-ready</div>
              <div className="mt-2 text-lg font-semibold text-foreground">{SITE_CONFIG.secondaryChannelLabel}</div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                UI và data model đã sẵn. Workflow riêng sẽ được nối bằng n8n ở phase sau.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[32px] border border-primary/10 bg-white/90 p-8 shadow-md backdrop-blur">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-foreground">Đăng nhập bằng OTP</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Dùng số điện thoại để vào portal. Luồng admin đăng nhập riêng và không đi qua màn customer này.
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
              </div>
              <Button type="submit" className="w-full" disabled={loading || !phoneInput.trim()}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Smartphone className="mr-2 h-4 w-4" />}
                Gửi mã OTP
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="rounded-2xl border border-primary/10 bg-primary/5 p-4 text-sm text-muted-foreground">
                OTP đã được gửi tới <span className="font-semibold text-foreground">{phoneInput}</span>.
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
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  Xác thực và vào portal
                </Button>
                <Button type="button" variant="outline" onClick={() => setOtpSent(false)} disabled={loading}>
                  Đổi số
                </Button>
              </div>
            </form>
          )}

          <div className="mt-6 rounded-2xl border border-border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
            Flow chuẩn là <span className="font-medium text-foreground">Pay → Activate → Link Telegram</span>. Zalo vẫn
            được chừa lane riêng, nhưng nếu muốn dùng ngay hôm nay thì Telegram là đường ngắn nhất.
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <a href={getPrimaryChannelHref()} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
              Mở CaloTrack trên Telegram
            </a>
            <a href={SITE_CONFIG.adminLoginPath} className="font-medium text-zinc-600 hover:text-foreground">
              Admin login
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
