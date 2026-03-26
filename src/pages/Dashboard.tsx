import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CreditCard,
  ExternalLink,
  LifeBuoy,
  Link2,
  Loader2,
  MessageCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  describeTier,
  formatBillingPriceVnd,
  formatTierLabel,
  getBillingCheckoutLabel,
  getBillingProviderSummary,
  type PlanTier,
} from "@/lib/billing";
import {
  fetchPortalSnapshot,
  getPortalChannelCards,
  linkPortalCustomerByPhone,
  type PortalSnapshot,
} from "@/lib/portalApi";
import { SITE_CONFIG, getPrimaryChannelHref } from "@/lib/siteConfig";
import { supabase } from "@/lib/supabase";

const SURFACE = "rounded-[32px] border border-primary/10 bg-white/85 p-6 shadow-md backdrop-blur";
const SUBSURFACE = "rounded-[28px] border border-primary/10 bg-white/85 p-5 shadow-sm";

function planTone(plan: PlanTier) {
  if (plan === "lifetime") return "border-accent/20 bg-accent/10 text-accent";
  if (plan === "pro") return "border-primary/15 bg-primary/10 text-primary";
  return "border-border bg-white text-zinc-600";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Chưa có";
  return new Date(value).toLocaleString("vi-VN");
}

function fallbackSnapshot(email: string | null | undefined): PortalSnapshot {
  return {
    customerId: null,
    linkedUserId: null,
    email: email ?? null,
    phoneE164: null,
    phoneDisplay: null,
    fullName: null,
    plan: "free",
    premiumUntil: null,
    dailyAiUsageCount: 0,
    entitlementSource: null,
    entitlementLabel: "Portal đã đăng nhập nhưng chưa linked customer theo số điện thoại",
    quotaLabel: `0/${SITE_CONFIG.freeDailyLimit} lượt AI hôm nay`,
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

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!user) return;
      setLoading(true);
      try {
        const next = await fetchPortalSnapshot({ id: user.id, email: user.email });
        if (!cancelled) {
          setSnapshot(next);
          setPhoneDraft(next.phoneDisplay || next.phoneE164 || "");
        }
      } catch {
        if (!cancelled) {
          const fallback = fallbackSnapshot(user.email);
          setSnapshot(fallback);
          setPhoneDraft("");
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
  const currentPlan = snapshot?.plan ?? "free";

  async function handleLinkPhone() {
    if (!phoneDraft.trim()) return;
    setLinkingPhone(true);
    try {
      await linkPortalCustomerByPhone(phoneDraft.trim());
      if (user) {
        const refreshed = await fetchPortalSnapshot({ id: user.id, email: user.email });
        setSnapshot(refreshed);
        setPhoneDraft(refreshed.phoneDisplay || refreshed.phoneE164 || phoneDraft.trim());
      }
    } finally {
      setLinkingPhone(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(249,115,22,0.08),_transparent_24%),linear-gradient(180deg,#f7fbfa_0%,#ffffff_46%,#f8fafc_100%)] px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className={SURFACE}>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
                {SITE_CONFIG.webPortalStatus}
              </div>
              <h1 className="text-3xl font-semibold tracking-[-0.04em] text-foreground">
                Portal khách hàng cho account, billing và entitlement đa kênh
              </h1>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Portal web là lớp account hỗ trợ. Tracking hằng ngày vẫn mạnh nhất trên Telegram, còn
                Zalo đang được chuẩn bị để nối vào cùng customer bằng số điện thoại.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Button asChild>
                <a href={getPrimaryChannelHref()} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Mở Telegram bot
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href={`/${SITE_CONFIG.pricingAnchor}`}>Xem bảng giá</a>
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
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Portal account</div>
            <div className="mt-3 text-xl font-semibold text-foreground">{snapshot?.email || user?.email || "Chưa có email"}</div>
            <div className="mt-2 text-sm text-muted-foreground">
              {snapshot?.source === "customer_linked"
                ? "Đã linked customer canonical"
                : snapshot?.source === "linked_user"
                  ? "Đang đọc từ compat user"
                  : snapshot?.source === "email_match"
                    ? "Đang đọc từ email match"
                    : "Chưa linked customer"}
            </div>
          </div>

          <div className={SUBSURFACE}>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Customer canonical</div>
            <div className="mt-3 text-xl font-semibold text-foreground">
              {snapshot?.phoneDisplay || snapshot?.phoneE164 || "Chưa linked số điện thoại"}
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {snapshot?.fullName || "Một customer có thể dùng Telegram + Zalo + portal cùng entitlement"}
            </div>
          </div>

          <div className={SUBSURFACE}>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Plan hiện tại</div>
            <div className="mt-3 flex items-center gap-3">
              <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${planTone(currentPlan)}`}>
                {formatTierLabel(currentPlan)}
              </span>
            </div>
            <div className="mt-3 text-sm text-muted-foreground">
              {snapshot?.entitlementLabel || describeTier(currentPlan)}
            </div>
          </div>

          <div className={SUBSURFACE}>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Quota & sync</div>
            <div className="mt-3 text-xl font-semibold text-foreground">{snapshot?.quotaLabel || "Đang tải quota"}</div>
            <div className="mt-2 text-sm text-muted-foreground">Sync gần nhất: {formatDate(snapshot?.lastSyncAt)}</div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <div className={SURFACE}>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <div className="text-sm font-semibold text-foreground">Linked channels</div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {channelCards.map((card) => (
                  <div key={card.key} className="rounded-2xl border border-primary/10 bg-primary/5 p-4">
                    <div className="text-sm font-semibold text-foreground">{card.label}</div>
                    <div className="mt-1 text-sm text-primary">{card.status}</div>
                    <div className="mt-2 text-sm text-muted-foreground">{card.helper}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className={SURFACE}>
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" />
                <div className="text-sm font-semibold text-foreground">Payment summary</div>
              </div>
              <div className="mt-4 space-y-3">
                {loading ? (
                  <div className="text-sm text-muted-foreground">Đang tải payment summary...</div>
                ) : snapshot?.payments.length ? (
                  snapshot.payments.map((payment) => (
                    <div key={payment.id} className="rounded-2xl border border-border bg-muted/30 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="font-semibold text-foreground">
                            {payment.billingSku || "Giao dịch portal"} • {formatBillingPriceVnd(payment.amount)}
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            {payment.paymentMethod || "payment"} • {payment.status} • {formatDate(payment.createdAt)}
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {payment.transactionCode || "Không có mã giao dịch"}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                    Chưa có payment summary cho customer này hoặc dữ liệu self-service chưa mở đầy đủ.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className={SURFACE}>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Phone-linked customer</div>
              <h2 className="mt-3 text-2xl font-semibold text-foreground">Link portal vào customer canonical</h2>
              <div className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
                <p>
                  Email magic link chỉ là lớp đăng nhập portal. Entitlement thật đi theo customer được link bằng số điện thoại.
                </p>
                <p>
                  Khi linked đúng, bạn có thể dùng chung quyền lợi giữa Telegram, Zalo và portal web mà không bị tách account.
                </p>
              </div>

              <div className="mt-5 space-y-3 rounded-[24px] border border-primary/10 bg-primary/5 p-4">
                <Input
                  value={phoneDraft}
                  onChange={(event) => setPhoneDraft(event.target.value)}
                  placeholder="Nhập số điện thoại để link customer, ví dụ 0912345678"
                />
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    onClick={handleLinkPhone}
                    disabled={linkingPhone || !phoneDraft.trim()}
                    className="sm:flex-1"
                  >
                    {linkingPhone ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
                    Link customer bằng số điện thoại
                  </Button>
                  <Button variant="outline" asChild className="sm:flex-1">
                    <a href={`mailto:${SITE_CONFIG.supportEmail}`}>
                      <LifeBuoy className="mr-2 h-4 w-4" />
                      Nhờ support link thủ công
                    </a>
                  </Button>
                </div>
                <div className="text-xs text-zinc-500">
                  Chính sách hiện tại là manual merge heavy. Các case mơ hồ sẽ được support/admin rà lại thay vì auto-merge.
                </div>
              </div>
            </div>

            <div className={SURFACE}>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Bước tiếp theo</div>
              <h2 className="mt-3 text-2xl font-semibold text-foreground">Đi đúng kênh, đúng role</h2>
              <div className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
                <p>Telegram vẫn là kênh tracking mạnh nhất hiện tại.</p>
                <p>Zalo đã được chuẩn bị ở frontend và data model, nhưng workflow riêng sẽ được nối ở phase n8n sau.</p>
                <p>Portal web tập trung vào account, billing, entitlement và lớp hỗ trợ vận hành.</p>
              </div>

              <div className="mt-5 grid gap-3">
                <Button asChild>
                  <a href={getPrimaryChannelHref()} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="mr-2 h-4 w-4" />
                    Mở Telegram để tiếp tục dùng
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <a href={`/${SITE_CONFIG.pricingAnchor}`}>
                    {getBillingCheckoutLabel("monthly")}
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <a href={`mailto:${SITE_CONFIG.supportEmail}`}>
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Liên hệ support
                  </a>
                </Button>
              </div>
            </div>

            <div className="rounded-[28px] border border-accent/15 bg-white/85 p-6 shadow-sm">
              <div className="text-sm font-semibold text-foreground">Billing note</div>
              <div className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
                <p>Provider hỗ trợ hiện tại: {getBillingProviderSummary()}.</p>
                <p>Frontend không hứa một flow thanh toán giả. Nó chỉ đi đúng theo backend/payment mapping hiện có.</p>
                <p>
                  Plan hiện tại của account này: <strong className="text-foreground">{formatTierLabel(currentPlan)}</strong>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
