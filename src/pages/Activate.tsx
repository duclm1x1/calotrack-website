import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  CheckCircle2,
  Loader2,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchPortalSnapshot,
  portalCreateZaloLinkToken,
  portalGetOrderStatus,
  type PortalOrderStatus,
  type PortalSnapshot,
} from "@/lib/portalApi";
import {
  SITE_CONFIG,
  getPrimaryChannelHref,
} from "@/lib/siteConfig";

export default function Activate() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [snapshot, setSnapshot] = useState<PortalSnapshot | null>(null);
  const [orderStatus, setOrderStatus] = useState<PortalOrderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [zaloLoading, setZaloLoading] = useState(false);

  const orderId = searchParams.get("order");
  const provider = searchParams.get("provider");
  const orderCode = searchParams.get("orderCode") || orderId;
  const transferNote = searchParams.get("note") || orderCode || "";
  const phoneParam = searchParams.get("phone");
  const linkedCount = snapshot?.linkedChannels.filter((item) => item.linkStatus === "linked").length ?? 0;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [nextSnapshot, nextOrderStatus] = await Promise.all([
          user
            ? fetchPortalSnapshot({ id: user.id, email: user.email, phone: user.phone })
            : Promise.resolve<PortalSnapshot | null>(null),
          orderId ? portalGetOrderStatus(orderId) : Promise.resolve<PortalOrderStatus | null>(null),
        ]);

        if (!cancelled) {
          setSnapshot(nextSnapshot);
          setOrderStatus(nextOrderStatus);
        }
      } catch (error) {
        if (!cancelled && orderId) {
          toast.error(String((error as Error)?.message || "Không thể đồng bộ trạng thái activation."));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [orderId, user]);

  const activationTone = useMemo(() => {
    if (orderStatus?.entitlementActive || snapshot?.plan === "pro" || snapshot?.plan === "lifetime") {
      return "border-primary/15 bg-primary/10 text-primary";
    }
    return "border-accent/20 bg-accent/10 text-accent";
  }, [orderStatus, snapshot?.plan]);

  const displayPhone =
    snapshot?.phoneDisplay || snapshot?.phoneE164 || user?.phone || phoneParam || "Chưa có";

  async function handleZaloLink() {
    setZaloLoading(true);
    try {
      if (!user) {
        toast.success("Lane Zalo đã sẵn trong UI và admin. Đăng nhập portal sau để gửi yêu cầu link chính thức.");
        return;
      }
      const result = await portalCreateZaloLinkToken();
      const linkCode = result.linkCode || result.linkToken || "";

      if (linkCode && navigator?.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(linkCode);
        } catch (error) {
          void error;
        }
      }

      window.open(result.zaloUrl || getPrimaryChannelHref(), "_blank", "noopener,noreferrer");
      toast.success(
        result.linkCode
          ? `${result.helperText} MÃ£ Ä‘Ã£ Ä‘Æ°á»£c copy: ${result.linkCode}`
          : result.helperText,
      );
    } catch (error) {
      toast.error(String((error as Error)?.message || "Không thể tạo yêu cầu link Zalo."));
    } finally {
      setZaloLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(249,115,22,0.08),_transparent_24%),linear-gradient(180deg,#f7fbfa_0%,#ffffff_46%,#f8fafc_100%)] px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-[32px] border border-primary/10 bg-white/90 p-8 shadow-md backdrop-blur">
          <div className="mb-4 inline-flex items-center rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
            Activate & connect
          </div>
          <h1 className="text-4xl font-semibold tracking-[-0.05em] text-foreground">
            Bắt đầu theo dõi dinh dưỡng đa nền tảng
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
            Tài khoản của bạn đã được gắn với số điện thoại này. Hãy làm quen với Trợ lý AI trên Zalo hoặc Telegram để bắt đầu ghi nhận bữa ăn. Trang web này sẽ giúp bạn quản lý gói cước và tài khoản.
          </p>
          {!user ? (
            <div className="mt-5 rounded-2xl border border-primary/10 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">
              Bạn chưa cần đăng nhập portal để xem màn này. Hãy giữ lại mã đơn hàng, hoàn tất thanh toán và mở Telegram bot
              để bắt đầu tracking ngay.
            </div>
          ) : null}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_0.92fr]">
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-[28px] border border-primary/10 bg-white/85 p-5 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Gói dịch vụ</div>
                <div className="mt-3 text-2xl font-semibold text-foreground">
                  {snapshot ? snapshot.plan.toUpperCase() : orderStatus?.entitlementActive ? "PRO" : "Đang tải"}
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {snapshot?.entitlementLabel || "Đang đồng bộ gói cước"}
                </div>
              </div>
              <div className="rounded-[28px] border border-primary/10 bg-white/85 p-5 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">SĐT đăng ký</div>
                <div className="mt-3 text-2xl font-semibold text-foreground truncate break-all">{displayPhone}</div>
                <div className="mt-2 text-sm text-muted-foreground">Số điện thoại chính dùng để bảo mật và quản lý tài khoản trong dashboard.</div>
              </div>
              <div className="rounded-[28px] border border-primary/10 bg-white/85 p-5 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Nền tảng kết nối</div>
                <div className="mt-3 text-2xl font-semibold text-foreground">{linkedCount}</div>
                <div className="mt-2 text-sm text-muted-foreground">Số lượng ứng dụng chat đã được đồng bộ với hồ sơ của bạn.</div>
              </div>
            </div>

            <div className={`rounded-[32px] border p-6 shadow-sm ${activationTone}`}>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-1 h-5 w-5" />
                <div>
                  <div className="text-sm font-semibold uppercase tracking-[0.18em]">Trạng thái gói</div>
                  <div className="mt-2 text-2xl font-semibold text-foreground">
                    {orderStatus?.entitlementActive || snapshot?.plan === "pro" || snapshot?.plan === "lifetime"
                      ? "Gói đã được kích hoạt"
                      : loading
                        ? "Đang kiểm tra"
                        : "Đang chờ backend xác nhận"}
                  </div>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                    {orderStatus
                      ? orderStatus.entitlementActive ? "Thanh toán xác nhận thành công. Toàn bộ tính năng cao cấp của gói Pro đã sẵn sàng để sử dụng." : `Đơn hàng ${orderStatus.orderId} đang được xử lý. Ngay khi xác nhận giao dịch chuyển khoản, hệ thống sẽ tự động kích hoạt toàn bộ quyền lợi huấn luyện của bạn.`
                      : "Đang đối soát giao dịch để mở khóa đầy đủ tính năng ưu việt của gói Pro."}
                  </p>
                </div>
              </div>
            </div>

            {!orderStatus?.entitlementActive ? (
              <div className="rounded-[32px] border border-primary/10 bg-white/90 p-6 text-center shadow-md backdrop-blur">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Biên lai đối soát</div>
                <h2 className="mt-3 text-2xl font-semibold text-foreground">Xác nhận chuyển khoản của bạn</h2>
                <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
                  Nếu bạn chưa quét mã ở bước trước, bạn có thể quét mã tương ứng dưới đây để hoàn tất. Hãy chắc chắn rằng
                  ghi chú chuyển khoản có chứa <strong>số điện thoại của bạn</strong> hoặc mã đơn <strong>{transferNote}</strong>.
                </p>

                {provider === "bank_transfer" ? (
                  <div className="mx-auto mt-6 max-w-sm rounded-[28px] border border-primary/10 bg-primary/5 p-6">
                    <div className="mb-4 text-sm font-semibold uppercase tracking-widest text-primary">Mã QR Techcombank</div>
                    <img src="/qr-tcb.png" alt="Techcombank" className="mx-auto w-full rounded-xl mix-blend-multiply" />
                  </div>
                ) : provider === "momo" ? (
                  <div className="mx-auto mt-6 max-w-sm rounded-[28px] border border-primary/10 bg-primary/5 p-6">
                    <div className="mb-4 text-sm font-semibold uppercase tracking-widest text-[#A50064]">Mã QR MoMo</div>
                    <img src="/qr-momo.jpg" alt="MoMo" className="mx-auto w-full rounded-xl mix-blend-multiply" />
                  </div>
                ) : null}

                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <Button variant="outline" onClick={() => window.location.reload()}>
                    <Loader2 className="mr-2 h-4 w-4" />
                    Làm mới trạng thái đơn hàng
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-6">
            <div className="rounded-[32px] border border-primary/10 bg-white/90 p-6 shadow-md backdrop-blur">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">BƯỚC TIẾP THEO</div>
              <h2 className="mt-3 text-2xl font-semibold text-foreground">Kết nối nền tảng chat yêu thích của bạn</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                AI CaloTrack đã sẵn sàng đồng hành cùng bữa ăn của bạn mỗi ngày. Hãy chọn ứng dụng bạn thường xuyên sử dụng nhất để bắt đầu.
              </p>

              <div className="mt-4 rounded-2xl border border-primary/10 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">
                <span className="font-medium text-foreground">
                  💡 Gợi ý: Mở ứng dụng chat 👉 Gửi bức ảnh bữa ăn đầu tiên 👉 Quay lại trang này bất cứ khi nào bạn cần hỗ trợ hoặc gia hạn nhé
                </span>
              </div>

              <div className="mt-5 grid gap-3">
                <Button className="bg-[#0068FF] hover:bg-[#005AE0] text-white" onClick={handleZaloLink} disabled={zaloLoading}>
                  {zaloLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}
                  Mở Zalo sử dụng ngay
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate(user ? SITE_CONFIG.dashboardPath : SITE_CONFIG.loginPath)}
                >
                  <ArrowUpRight className="mr-2 h-4 w-4" />
                  {user ? "Mở Dashboard" : "Đăng nhập Dashboard"}
                </Button>
              </div>
            </div>

            <div className="rounded-[28px] border border-accent/15 bg-white/85 p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-1 h-5 w-5 text-accent" />
                <div>
                  <div className="text-sm font-semibold text-foreground">Bảo mật tài khoản</div>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground list-disc pl-5">
                    <li>1 số điện thoại = 1 cá nhân sở hữu</li>
                    <li>Mỗi tài khoản Telegram và Zalo chỉ được liên kết với 1 tài khoản chính</li>
                    <li>Thông tin đăng ký sẽ không bị ảnh hưởng nếu bạn đổi tài khoản mạng xã hội.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
