import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, MessageCircle, Smartphone, ShieldCheck, CheckCircle2 } from "lucide-react";
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
  const bridgeToken = useMemo(
    () => String(searchParams.get("bridge") || "").trim(),
    [searchParams],
  );
  const isZaloBridgeFlow = useMemo(
    () => bridgeToken.length > 0 && String(searchParams.get("channel") || "").trim().toLowerCase() === "zalo",
    [bridgeToken, searchParams],
  );

  const [phoneInput, setPhoneInput] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpValue, setOtpValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [authIssue, setAuthIssue] = useState<string | null>(null);
  const [phoneHelper, setPhoneHelper] = useState(
    isZaloBridgeFlow
      ? "Nhập số điện thoại đã dùng Zalo để nhận OTP. Xác thực xong hệ thống sẽ mở Pro dùng thử 7 ngày và hướng dẫn bạn confirm lại mã ngay trong chính chat Zalo đó."
      : "Nhập số điện thoại đã dùng Zalo để nhận OTP, xác thực account và mở Pro dùng thử 7 ngày.",
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

  async function handleSendOtp(event: FormEvent) {
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
      toast.success("Mã xác thực đã được gửi qua Zalo. Xác thực xong bạn chỉ cần mở lại chat Zalo và confirm mã vừa được gửi ở ngay ở trên nhé.");
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

  async function handleVerifyOtp(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setAuthIssue(null);

    try {
      const result = await portalVerifyPhoneOtp(phoneInput, otpValue, {
        bridge: bridgeToken || null,
      });

      if (result.zaloAutoLinked) {
        toast.success(
          "Xác thực thành công. Pro dùng thử 7 ngày đã được mở và chat Zalo này đã được nối tự động. Bạn có thể quay lại Zalo để dùng ngay.",
        );
      } else if (result.claimStatus === "pending_claim") {
        toast.success(
          "Xác thực thành công. Pro dùng thử 7 ngày đã được mở. Mở lại chat Zalo và confirm mã vừa được gửi ở ngay ở trên nhé.",
        );
      } else if (result.accessState === "trialing") {
        toast.success("Xác thực thành công. Pro dùng thử 7 ngày đã được kích hoạt cho tài khoản của bạn.");
      } else {
        toast.success("Xác thực số điện thoại thành công.");
      }

      if (isZaloBridgeFlow && !result.zaloAutoLinked) {
        setAuthIssue(
          result.bridgeStatus === "conflict"
            ? "Số điện thoại đã được xác thực nhưng Zalo này đang gắn với một customer khác. Bạn vẫn dùng được portal ngay, còn Zalo cần support xử lý."
            : result.claimStatus === "pending_claim"
              ? "Pro dùng thử 7 ngày đã mở. Bây giờ bạn chỉ cần quay lại Zalo và confirm mã vừa được gửi ở ngay ở trên để nối đúng chat."
            : "Số điện thoại đã được xác thực và trial đã mở. Nếu Zalo chưa vào được ngay, hãy mở dashboard để tạo self-link như một phương án dự phòng.",
        );
      }

      navigate(nextPath, { replace: true });
    } catch (error) {
      toast.error(String((error as Error)?.message || "OTP chưa đúng hoặc đã hết hạn."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center bg-zinc-50 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.12),transparent)] px-4 py-12">
      <div className="mx-auto grid w-full max-w-[1060px] gap-10 lg:grid-cols-[1.1fr_440px] lg:items-center">
        {/* LEFT COLUMN: TRUST & CONTEXT */}
        <div className="flex flex-col justify-center">
          <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary backdrop-blur-sm">
            <ShieldCheck className="h-4 w-4" />
            Bảo mật & Kích hoạt qua Zalo
          </div>
          
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 md:text-5xl lg:leading-[1.1]">
            Xác thực tài khoản <br />
            <span className="text-primary">mở Pro dùng thử 7 ngày</span>.
          </h1>
          
          <p className="mt-6 max-w-lg text-base leading-7 text-zinc-600">
            Hệ thống CaloTrack sử dụng luồng xác thực an toàn qua Zalo. Chỉ cần nhập số điện thoại, nhận OTP và hệ thống sẽ tự động đồng bộ hành trình của bạn trên Portal và Zalo.
          </p>

          <div className="mt-10 space-y-6">
            {[
              { title: "Xác thực nhanh qua Zalo OA", desc: "Mã OTP sẽ được gửi trực tiếp tới Zalo của bạn một cách an toàn và bảo mật." },
              { title: "Kích hoạt Pro dùng thử 7 ngày", desc: "Tự động bắt đầu trải nghiệm đầy đủ ngay sau khi xác thực." },
              { title: "Đồng bộ đa nền tảng", desc: "Dữ liệu huấn luyện liền mạch giữa Portal, Zalo và Telegram với duy nhất một tài khoản." }
            ].map((item, idx) => (
              <div key={idx} className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-zinc-900">{item.title}</h3>
                  <p className="mt-1 text-sm text-zinc-600">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT COLUMN: LOGIN FORM */}
        <div className="relative overflow-hidden rounded-[32px] border border-primary/10 bg-white/80 p-8 shadow-2xl backdrop-blur-xl ring-1 ring-black/5 md:p-10">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-zinc-900">
              {!otpSent ? "Bắt đầu ngay" : "Nhập mã OTP"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              {!otpSent 
                ? "Nhập số điện thoại đã dùng thiết lập Zalo của bạn để nhận mã truy cập an toàn."
                : `Mã xác thực 6 số đã được gửi qua Zalo tới số điện thoại `}
              {otpSent && <span className="font-semibold text-zinc-900">{phoneInput}</span>}
            </p>
            {isZaloBridgeFlow && !otpSent && (
              <div className="mt-4 rounded-2xl border border-primary/15 bg-primary/5 p-3.5 text-sm leading-relaxed text-primary">
                Bạn đang chuyển tiếp từ <strong>Zalo</strong>. Sau khi xác thực, hệ thống sẽ <strong>tự động nối lại chat</strong> để bạn sử dụng ngay.
              </div>
            )}
          </div>

          {!otpSent ? (
            <form onSubmit={handleSendOtp} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-zinc-900">Số điện thoại</label>
                <div className="relative">
                  <Smartphone className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                  <Input
                    type="tel"
                    inputMode="tel"
                    placeholder="Ví dụ: 0912345678"
                    value={phoneInput}
                    onChange={(event) => setPhoneInput(event.target.value)}
                    required
                    className="h-12 border-zinc-200 bg-white/50 pl-11 text-base placeholder:text-zinc-400 focus-visible:border-primary focus-visible:ring-primary/20"
                  />
                </div>
              </div>

              <Button 
                type="submit" 
                className="h-12 w-full rounded-xl text-base font-semibold shadow-md transition-all active:scale-[0.98]" 
                disabled={loading || !phoneInput.trim()}
              >
                {loading ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  "Gửi mã OTP"
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-6">
              <div className="flex flex-col items-center space-y-3">
                <label className="text-sm font-semibold text-zinc-900">Mã xác thực</label>
                <InputOTP
                  maxLength={6}
                  value={otpValue}
                  onChange={setOtpValue}
                  containerClassName="justify-center"
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} className="h-12 w-12 text-lg font-semibold" />
                    <InputOTPSlot index={1} className="h-12 w-12 text-lg font-semibold" />
                    <InputOTPSlot index={2} className="h-12 w-12 text-lg font-semibold" />
                    <InputOTPSlot index={3} className="h-12 w-12 text-lg font-semibold" />
                    <InputOTPSlot index={4} className="h-12 w-12 text-lg font-semibold" />
                    <InputOTPSlot index={5} className="h-12 w-12 text-lg font-semibold" />
                  </InputOTPGroup>
                </InputOTP>
              </div>

              <div className="flex flex-col gap-3">
                <Button 
                  type="submit" 
                  className="h-12 w-full rounded-xl text-base font-semibold shadow-md transition-all active:scale-[0.98]" 
                  disabled={loading || otpValue.length < 6}
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : (
                    "Xác nhận & Bắt đầu"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-12 w-full rounded-xl text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                  onClick={() => {
                    setOtpSent(false);
                    setOtpValue("");
                  }}
                >
                  Thay đổi số điện thoại
                </Button>
              </div>

              <div className="mt-2 rounded-2xl border border-[#0068FF]/10 bg-[#0068FF]/5 p-4 text-center">
                <p className="text-sm font-medium text-zinc-900">Chưa nhận được mã?</p>
                <p className="mt-1 text-xs text-zinc-600">
                  Mở ứng dụng Zalo và kiểm tra tin nhắn từ OA CaloTrack nhé.
                </p>
                <Button variant="outline" asChild className="mt-3 h-10 w-full gap-2 border-[#0068FF]/20 bg-white text-[#0068FF] hover:bg-[#0068FF]/5 hover:text-[#0068FF]">
                  <a href={SITE_CONFIG.zaloOaUrl} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="h-4 w-4" />
                    Mở ứng dụng Zalo
                  </a>
                </Button>
              </div>
            </form>
          )}

          {(authIssue || (!otpSent && phoneHelper)) && (
            <div className={`mt-6 rounded-2xl border p-4 text-sm leading-relaxed ${authIssue ? "border-red-100 bg-red-50 text-red-800" : "border-primary/10 bg-primary/5 text-zinc-600"}`}>
              {authIssue || phoneHelper}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
