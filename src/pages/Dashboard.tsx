import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CreditCard, ExternalLink, Link2, Loader2, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatTierLabel, getBillingCheckoutLabel } from "@/lib/billing";
import {
  fetchPortalSnapshot,
  getPortalChannelCards,
  linkPortalCustomerByPhone,
  portalCreateTelegramLinkToken,
  portalRequestZaloLink,
  type PortalSnapshot,
} from "@/lib/portalApi";
import { SITE_CONFIG, getPrimaryChannelHref } from "@/lib/siteConfig";
import { supabase } from "@/lib/supabase";
import { MacroTracker } from "../components/dashboard/MacroTracker";

const SURFACE = "rounded-[32px] border border-primary/10 bg-white/85 p-6 shadow-md backdrop-blur";
const SUBSURFACE = "rounded-[28px] border border-primary/10 bg-white/85 p-5 shadow-sm";

function formatDate(value: string | null | undefined) {
  if (!value) return "Chưa có";
  return new Date(value).toLocaleString("vi-VN");
}

function planTone(plan: PortalSnapshot["plan"]) {
  if (plan === "lifetime") return "border-accent/20 bg-accent/10 text-accent";
  if (plan === "pro") return "border-primary/15 bg-primary/10 text-primary";
  return "border-border bg-white text-zinc-600";
}

function fallbackSnapshot(user: { email?: string | null; phone?: string | null }): PortalSnapshot {
  return {
    customerId: null,
    linkedUserId: null,
    email: user.email ?? null,
    phoneE164: user.phone ?? null,
    phoneDisplay: user.phone ?? null,
    fullName: null,
    plan: "free",
    premiumUntil: null,
    dailyAiUsageCount: 0,
    entitlementSource: null,
    entitlementLabel: "Tài khoản của bạn đã có trên hệ thống, vui lòng nhập số điện thoại để kết nối.",
    quotaLabel: "0/5 lượt AI hôm nay",
    source: "auth_only",
    payments: [],
    linkedChannels: [],
    lastSyncAt: new Date().toISOString(),
  };
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<PortalSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [linkingPhone, setLinkingPhone] = useState(false);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [zaloLoading, setZaloLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!user) return;
      setLoading(true);
      try {
        const next = await fetchPortalSnapshot({ id: user.id, email: user.email, phone: user.phone });
        if (!cancelled) {
          setSnapshot(next);
          setPhoneDraft(next.phoneDisplay || next.phoneE164 || user.phone || "");
        }
      } catch {
        if (!cancelled) {
          const fallback = fallbackSnapshot({ email: user.email, phone: user.phone });
          setSnapshot(fallback);
          setPhoneDraft(fallback.phoneDisplay || "");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const channelCards = useMemo(() => getPortalChannelCards(snapshot), [snapshot]);
  const linkedChannelsCount = snapshot?.linkedChannels.filter((item) => item.linkStatus === "linked").length ?? 0;

  async function handleRefresh() {
    if (!user) return;
    setLoading(true);
    try {
      const refreshed = await fetchPortalSnapshot({ id: user.id, email: user.email, phone: user.phone });
      setSnapshot(refreshed);
      setPhoneDraft(refreshed.phoneDisplay || refreshed.phoneE164 || user.phone || "");
    } catch (error) {
      toast.error(String((error as Error)?.message || "Không thể làm mới dữ liệu portal."));
    } finally {
      setLoading(false);
    }
  }

  async function handleLinkPhone() {
    if (!phoneDraft.trim()) return;
    setLinkingPhone(true);
    try {
      await linkPortalCustomerByPhone(phoneDraft.trim());
      toast.success("Đã kết nối tài khoản với số điện thoại của bạn.");
      await handleRefresh();
    } catch (error) {
      toast.error(String((error as Error)?.message || "Không thể lưu hồ sơ số điện thoại lúc này."));
    } finally {
      setLinkingPhone(false);
    }
  }

  async function handleTelegramLink() {
    setTelegramLoading(true);
    try {
      const result = await portalCreateTelegramLinkToken();
      window.open(result.url, "_blank", "noopener,noreferrer");
      toast.success(
        result.status === "ready"
          ? "Đã mở Telegram với link token để nối account."
          : "Đã mở Telegram bot. Token flow sẽ đủ hơn khi backend mới được apply.",
      );
    } catch (error) {
      toast.error(String((error as Error)?.message || "Không thể mở Telegram link."));
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(249,115,22,0.08),_transparent_24%),linear-gradient(180deg,#f7fbfa_0%,#ffffff_46%,#f8fafc_100%)] px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className={SURFACE}>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
                Khu vực Quản Trị
              </div>
              <h1 className="text-3xl font-semibold tracking-[-0.04em] text-foreground">
                Một tài khoản, nhiều mạng lưới, một số điện thoại duy nhất.
              </h1>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Chào mừng bạn đến với hệ thống AI Tracking của CaloTrack. Sử dụng portal để quản lý gói cước, theo dõi dinh dưỡng và kết nối Telegram bot siêu tốc.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Button asChild>
                <a href={getPrimaryChannelHref()} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Mở Telegram bot
                </a>
              </Button>
              <Button variant="outline" onClick={() => navigate(`${SITE_CONFIG.checkoutPath}?plan=pro`)}>
                {getBillingCheckoutLabel("monthly")}
              </Button>
              <Button
                variant="ghost"
                onClick={async () => {
                  await supabase.auth.signOut();
                  navigate("/");
                }}
              >
                Đăng xuất
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          <div className={SUBSURFACE}>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Tài Khoản</div>
            <div className="mt-3 text-xl font-semibold text-foreground">{user?.phone || snapshot?.phoneDisplay || "Chưa có SDT"}</div>
            <div className="mt-2 text-sm text-muted-foreground">
              {snapshot?.source === "customer_linked" ? "Đã xác nhận đầy đủ thông tin" : "Tài khoản của bạn thiếu SDT"}
            </div>
          </div>
          <div className={SUBSURFACE}>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Plan hiện tại</div>
            <div className="mt-3">
              <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${planTone(snapshot?.plan ?? "free")}`}>
                {formatTierLabel(snapshot?.plan ?? "free")}
              </span>
            </div>
            <div className="mt-3 text-sm text-muted-foreground">{snapshot?.entitlementLabel || "Đang đồng bộ entitlement"}</div>
          </div>
          <div className={SUBSURFACE}>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Quota hôm nay</div>
            <div className="mt-3 text-xl font-semibold text-foreground">{snapshot?.quotaLabel || "Đang tải quota"}</div>
            <div className="mt-2 text-sm text-muted-foreground">Giới hạn dùng thông minh tổng hợp từ mọi thiết bị.</div>
          </div>
          <div className={SUBSURFACE}>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Linked channels</div>
            <div className="mt-3 text-xl font-semibold text-foreground">{linkedChannelsCount}</div>
            <div className="mt-2 text-sm text-muted-foreground">Kết nối ít nhất một ứng dụng Chat AI để bắt đầu theo dõi.</div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <div className="space-y-6">
            <div className={SURFACE}>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <div className="text-sm font-semibold text-foreground">Kênh đã link và trạng thái sử dụng</div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {channelCards.map((card) => (
                  <div key={card.key} className="rounded-2xl border border-primary/10 bg-primary/5 p-4">
                    <div className="text-sm font-semibold text-foreground">{card.label}</div>
                    <div className="mt-1 text-sm text-primary">{card.status}</div>
                    <div className="mt-2 text-sm leading-6 text-muted-foreground">{card.helper}</div>
                  </div>
                ))}
              </div>
            </div>
            
            <MacroTracker linkedUserId={snapshot?.linkedUserId ?? null} />

            <div className={SURFACE}>
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" />
                <div className="text-sm font-semibold text-foreground">Lịch sử hóa đơn</div>
              </div>
              <div className="mt-4 space-y-3">
                {loading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Đang tải payment summary...
                  </div>
                ) : snapshot?.payments.length ? (
                  snapshot.payments.map((payment) => (
                    <div key={payment.id} className="rounded-2xl border border-border bg-muted/30 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="font-semibold text-foreground">
                            {payment.billingSku || "Portal order"} • {payment.amount.toLocaleString("vi-VN")}đ
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            {payment.provider || payment.paymentMethod || "payment"} • {payment.status} • {formatDate(payment.createdAt)}
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground">{payment.transactionCode || "Chưa có mã giao dịch"}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                    Bạn chưa thực hiện thanh toán nào, hoặc đang dùng gói cước miễn phí hệ thống cấp.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className={SURFACE}>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Bảo Vệ Tài Khoản</div>
              <h2 className="mt-3 text-2xl font-semibold text-foreground">Xác nhận số điện thoại của bạn</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Mọi thứ đều đi qua số điện thoại của bạn. Bổ sung ngay bây giờ để hệ thống của chúng tôi mở khóa các thiết lập nâng cao và giúp bạn xem hóa đơn của mình.
              </p>
              <div className="mt-5 space-y-3 rounded-[24px] border border-primary/10 bg-primary/5 p-4">
                <Input
                  value={phoneDraft}
                  onChange={(event) => setPhoneDraft(event.target.value)}
                  placeholder="Ví dụ 0912345678"
                />
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button onClick={handleLinkPhone} disabled={linkingPhone || !phoneDraft.trim()} className="sm:flex-1">
                    {linkingPhone ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
                    Cập nhật số điện thoại
                  </Button>
                  <Button variant="outline" onClick={handleRefresh} className="sm:flex-1">
                    Tải lại thông tin
                  </Button>
                </div>
              </div>
            </div>

            <div className={SURFACE}>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Kích hoạt kênh sử dụng</div>
              <h2 className="mt-3 text-2xl font-semibold text-foreground">Liên kết kênh chat trực tiếp</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Nếu bạn vừa đăng ký hoặc link số điện thoại, bạn có thể bắt đầu chat ngay trên Telegram hoặc Zalo OA để theo dõi lượng calories mỗi ngày.
              </p>
              <div className="mt-4 grid gap-3">
                <Button onClick={handleTelegramLink} disabled={telegramLoading}>
                  {telegramLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}
                  Mở Telegram và link account
                </Button>
                <Button variant="outline" onClick={handleZaloLink} disabled={zaloLoading}>
                  {zaloLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                  Tạo yêu cầu kết nối Zalo
                </Button>
                <Button variant="outline" onClick={() => navigate(SITE_CONFIG.activatePath)}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Mở màn activation
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
