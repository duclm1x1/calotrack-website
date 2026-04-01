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

function describeAuthIssue(error: unknown): string | null {
  const message = String((error as Error)?.message || error || "").toLowerCase();
  if (message.includes("unsupported phone provider")) {
    return "Hệ thống gửi mã xác nhận đang bảo trì. Bạn có thể thử lại sau hoặc liên hệ hỗ trợ để được xử lý thủ công.";
  }
  return null;
}

export default function Login() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [phoneInput, setPhoneInput] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpValue, setOtpValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [authIssue, setAuthIssue] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      navigate(SITE_CONFIG.dashboardPath, { replace: true });
    }
  }, [navigate, user]);

  async function handleSendOtp(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setAuthIssue(null);
    try {
      const result = await portalStartPhoneAuth(phoneInput);
      setPhoneInput(result.phoneE164);
      setOtpSent(true);
      toast.success("Mã OTP đã được gửi tới số điện thoại của bạn.");
    } catch (error) {
      const nextIssue = describeAuthIssue(error);
      if (nextIssue) {
        setAuthIssue(nextIssue);
      }
      toast.error(String((error as Error)?.message || "Không thể gửi OTP lúc này."));
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
        toast.success("Xác thực thành công. Dùng thử 7 ngày đã bắt đầu cho tài khoản của bạn.");
      } else {
        toast.success("Xác thực số điện thoại thành công.");
      }
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
            Đăng nhập tài khoản
          </div>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.05em] text-foreground">
            Xác thực số điện thoại để mở trial và dùng CaloTrack trên mọi kênh.
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
            Số điện thoại đã verify là định danh duy nhất của tài khoản. Sau bước này, hệ thống sẽ tạo hoặc liên kết customer truth, bật dùng thử 7 ngày và đồng bộ quyền dùng trên Zalo, Telegram và portal.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <span className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">✓ Miễn phí 7 ngày — không cần thẻ</span>
            <span className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">✓ Kích hoạt ngay sau OTP</span>
            <span className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">✓ Dùng chung Zalo, Telegram &amp; Portal</span>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-primary/10 bg-primary/5 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Không cần app</div>
              <div className="mt-2 text-lg font-semibold text-foreground">Chat là xong</div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Dùng Zalo hoặc Telegram bạn đã có sẵn — không cần tải thêm app nào.
              </p>
            </div>
            <div className="rounded-3xl border border-primary/10 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Dùng thử ngay</div>
              <div className="mt-2 text-lg font-semibold text-foreground">7 ngày Free sau OTP</div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Verify xong là trial bắt đầu ngay. Không cần thẻ, không cần thanh toán trước.
              </p>
            </div>
            <div className="rounded-3xl border border-accent/15 bg-accent/5 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Đồng bộ đa kênh</div>
              <div className="mt-2 text-lg font-semibold text-foreground">1 SĐT — Dùng mọi nơi</div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Số điện thoại là định danh duy nhất. Quyền lợi đồng bộ chung cho Zalo, Telegram và portal.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[32px] border border-primary/10 bg-white/90 p-8 shadow-md backdrop-blur">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-foreground">Đăng nhập bằng OTP</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Nhập số điện thoại của bạn, nhận mã OTP qua SMS và xác thực để mở portal cũng như quyền dùng bot.
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
                <div className="mt-1 text-xs text-muted-foreground/90">
                  Mã có hiệu lực trong 3 phút. Nếu chưa nhận được SMS, hãy chờ một chút rồi gửi lại.
                </div>
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

          {authIssue ? (
            <div className="mt-4 rounded-2xl border border-accent/20 bg-accent/10 p-4 text-sm leading-6 text-muted-foreground">
              {authIssue}
            </div>
          ) : null}

          <div className="mt-6 rounded-2xl border border-border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
            Trước khi dùng CaloTrack trên Zalo hoặc Telegram, bạn bắt buộc phải xác thực số điện thoại. Khi OTP đúng, hệ thống sẽ tạo customer truth và mở trial 7 ngày.
          </div>

          <div className="mt-6 grid gap-3">
            <Button variant="outline" onClick={() => navigate(`${SITE_CONFIG.checkoutPath}?plan=pro`)}>
              Mua gói và sang activation ngay
            </Button>
            <a
              href={getPrimaryChannelHref()}
              target="_blank"
              rel="noopener noreferrer"
              className="text-center text-sm font-medium text-primary hover:underline"
            >
              Mở CaloTrack trên Zalo
            </a>
            <a
              href={SITE_CONFIG.adminLoginPath}
              className="text-center text-sm font-medium text-zinc-600 hover:text-foreground"
            >
              Admin login
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
