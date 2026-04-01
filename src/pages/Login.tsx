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
    return "Hệ thống gửi mã xác nhận đang bảo trì. Bạn có thể thanh toán trực tiếp để kích hoạt gói cước ngay mà không cần mã OTP.";
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
            Đăng Nhập Tài Khoản
          </div>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.05em] text-foreground">
            Quản lý gói cước CaloTrack bằng số điện thoại của bạn.
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
            Đăng nhập để xem lịch sử giao dịch và kết nối hệ thống AI Bot trên Telegram hay Zalo OA!
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-primary/10 bg-primary/5 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Bảo Mật Tối Đa</div>
              <div className="mt-2 text-lg font-semibold text-foreground">SĐT Định Danh</div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Gói cước được bảo vệ bằng hệ thống cấp quyền qua số điện thoại duy nhất, dùng chung mọi kênh chat.
              </p>
            </div>
            <div className="rounded-3xl border border-primary/10 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Đa Nền Tảng</div>
              <div className="mt-2 text-lg font-semibold text-foreground">Zalo & Telegram</div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Gắn kết liền mạch dữ liệu bữa ăn dù bạn dùng bot ở bất cứ mạng lưới tin nhắn nào.
              </p>
            </div>
            <div className="rounded-3xl border border-accent/15 bg-accent/5 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Thống Kê Vóc Dáng</div>
              <div className="mt-2 text-lg font-semibold text-foreground">Dashboard</div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Quản lý lịch sử thanh toán và thống kê lượng Calo nạp vào hàng tuần một cách trực quan nhất.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[32px] border border-primary/10 bg-white/90 p-8 shadow-md backdrop-blur">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-foreground">Đăng nhập bằng OTP</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Hệ thống sẽ gửi một tin nhắn chứa mã bảo mật tới số điện thoại của bạn.
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

          {authIssue ? (
            <div className="mt-4 rounded-2xl border border-accent/20 bg-accent/10 p-4 text-sm leading-6 text-muted-foreground">
              {authIssue}
            </div>
          ) : null}

          <div className="mt-6 rounded-2xl border border-border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
            Nhập số điện thoại của bạn để nhận mã truy cập. Nếu bạn chưa rõ điều gì, có thể chuyển sang trang đăng ký bên dưới.
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
              Mở CaloTrack trên Telegram
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
