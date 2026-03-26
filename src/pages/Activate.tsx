import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowUpRight, CheckCircle2, Link2, Loader2, MessageCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchPortalSnapshot,
  portalCreateTelegramLinkToken,
  portalGetOrderStatus,
  portalRequestZaloLink,
  type PortalOrderStatus,
  type PortalSnapshot,
} from "@/lib/portalApi";
import { SITE_CONFIG } from "@/lib/siteConfig";

export default function Activate() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [snapshot, setSnapshot] = useState<PortalSnapshot | null>(null);
  const [orderStatus, setOrderStatus] = useState<PortalOrderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [zaloLoading, setZaloLoading] = useState(false);

  const orderId = searchParams.get("order");
  const linkedCount = snapshot?.linkedChannels.filter((item) => item.linkStatus === "linked").length ?? 0;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!user) return;
      setLoading(true);
      try {
        const [nextSnapshot, nextOrderStatus] = await Promise.all([
          fetchPortalSnapshot({ id: user.id, email: user.email, phone: user.phone }),
          orderId ? portalGetOrderStatus(orderId) : Promise.resolve(null),
        ]);
        if (!cancelled) {
          setSnapshot(nextSnapshot);
          setOrderStatus(nextOrderStatus);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
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

  async function handleTelegramLink() {
    setTelegramLoading(true);
    try {
      const result = await portalCreateTelegramLinkToken();
      window.open(result.url, "_blank", "noopener,noreferrer");
      toast.success(
        result.status === "ready"
          ? "Đã tạo Telegram link token. Mở bot để hoàn tất liên kết."
          : "Đã mở Telegram bot. Token flow sẽ đủ hơn khi backend mới được apply.",
      );
    } catch (error) {
      toast.error(String((error as Error)?.message || "Không thể tạo Telegram link lúc này."));
    } finally {
      setTelegramLoading(false);
    }
  }

  async function handleZaloLink() {
    setZaloLoading(true);
    try {
      const result = await portalRequestZaloLink();
      toast.success(result.helperText);
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
            Gói đã active thì bước tiếp theo phải là dùng được ngay trên Telegram.
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
            Quyền sử dụng nằm ở customer theo số điện thoại. Sau khi activate, bạn chỉ còn một việc là link ít nhất một
            kênh để bắt đầu dùng thật, với Telegram là đường ngắn nhất ở phase hiện tại.
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_0.92fr]">
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-[28px] border border-primary/10 bg-white/85 p-5 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Plan hiện tại</div>
                <div className="mt-3 text-2xl font-semibold text-foreground">
                  {snapshot ? snapshot.plan.toUpperCase() : "Đang tải"}
                </div>
                <div className="mt-2 text-sm text-muted-foreground">{snapshot?.entitlementLabel || "Đang đồng bộ entitlement"}</div>
              </div>
              <div className="rounded-[28px] border border-primary/10 bg-white/85 p-5 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">SĐT canonical</div>
                <div className="mt-3 text-2xl font-semibold text-foreground">
                  {snapshot?.phoneDisplay || snapshot?.phoneE164 || user?.phone || "Chưa có"}
                </div>
                <div className="mt-2 text-sm text-muted-foreground">Phone verified là chìa khóa shared entitlement.</div>
              </div>
              <div className="rounded-[28px] border border-primary/10 bg-white/85 p-5 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Linked channels</div>
                <div className="mt-3 text-2xl font-semibold text-foreground">{linkedCount}</div>
                <div className="mt-2 text-sm text-muted-foreground">Cần ít nhất 1 kênh active để dùng flow chat-first.</div>
              </div>
            </div>

            <div className={`rounded-[32px] border p-6 shadow-sm ${activationTone}`}>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-1 h-5 w-5" />
                <div>
                  <div className="text-sm font-semibold uppercase tracking-[0.18em]">Activation state</div>
                  <div className="mt-2 text-2xl font-semibold text-foreground">
                    {orderStatus?.entitlementActive || snapshot?.plan === "pro" || snapshot?.plan === "lifetime"
                      ? "Plan đã active"
                      : loading
                        ? "Đang kiểm tra"
                        : "Đang chờ backend xác nhận"}
                  </div>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                    {orderStatus
                      ? `Order ${orderStatus.orderId} hiện ở trạng thái ${orderStatus.status}. Khi backend xác nhận thành công, entitlement sẽ bật ngay ở cấp customer.`
                      : "Nếu bạn vừa thanh toán, website sẽ dùng callback/IPN hoặc reconciliation backend làm nguồn sự thật cuối cùng trước khi cấp quyền."}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[32px] border border-primary/10 bg-white/90 p-6 shadow-md backdrop-blur">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Bắt đầu sử dụng ngay</div>
              <h2 className="mt-3 text-2xl font-semibold text-foreground">Kết nối Telegram trước, Zalo là lane tiếp theo</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Bạn có thể chọn một hoặc cả hai kênh. Entitlement luôn map về phone/customer, nhưng nếu muốn sử dụng ngay
                sau khi thanh toán thì Telegram là flow live ngắn nhất.
              </p>

              <div className="mt-4 rounded-2xl border border-primary/10 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">
                Trình tự khuyến nghị: <span className="font-medium text-foreground">Thanh toán thành công → mở Telegram → gửi /start token → quay lại portal để thấy trạng thái linked.</span>
              </div>

              <div className="mt-5 grid gap-3">
                <Button onClick={handleTelegramLink} disabled={telegramLoading}>
                  {telegramLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}
                  Dùng ngay trên Telegram
                </Button>
                <Button variant="outline" onClick={handleZaloLink} disabled={zaloLoading}>
                  {zaloLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
                  Tạo yêu cầu kết nối Zalo
                </Button>
                <Button variant="outline" onClick={() => navigate(SITE_CONFIG.dashboardPath)}>
                  <ArrowUpRight className="mr-2 h-4 w-4" />
                  Mở customer portal
                </Button>
              </div>
            </div>

            <div className="rounded-[28px] border border-accent/15 bg-white/85 p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-1 h-5 w-5 text-accent" />
                <div>
                  <div className="text-sm font-semibold text-foreground">Rule đã khóa</div>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                    <li>1 số điện thoại = 1 customer canonical.</li>
                    <li>1 Telegram account và 1 Zalo account chỉ link tối đa 1 customer.</li>
                    <li>Pro entitlement nằm ở customer, không nằm ở channel.</li>
                    <li>Không nên unlink sạch mọi thứ nếu chưa còn phone verified hoặc kênh active.</li>
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
