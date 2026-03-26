import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Building2, CheckCircle2, Loader2, QrCode, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import {
  PUBLIC_CHECKOUT_PROVIDERS,
  PUBLIC_PLAN_CARDS,
  formatTierLabel,
  getDefaultSkuForTier,
  type PlanTier,
  type PublicCheckoutProvider,
} from "@/lib/billing";
import { fetchPortalSnapshot, portalStartCheckout } from "@/lib/portalApi";
import {
  SITE_CONFIG,
  hasConfiguredBankTransfer,
  hasConfiguredMomoCheckout,
} from "@/lib/siteConfig";

function parsePlan(value: string | null): PlanTier {
  if (value === "pro" || value === "lifetime") {
    return value;
  }
  return "free";
}

export default function Checkout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [selectedPlan, setSelectedPlan] = useState<PlanTier>(parsePlan(searchParams.get("plan")));
  const [provider, setProvider] = useState<PublicCheckoutProvider>(
    hasConfiguredMomoCheckout() ? "momo" : "bank_transfer",
  );
  const [phoneDraft, setPhoneDraft] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!user) return;
      try {
        const snapshot = await fetchPortalSnapshot({
          id: user.id,
          email: user.email,
          phone: user.phone,
        });
        if (!cancelled) {
          setPhoneDraft(snapshot.phoneDisplay || snapshot.phoneE164 || user.phone || "");
        }
      } catch {
        if (!cancelled) {
          setPhoneDraft(user.phone || "");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const currentCard = useMemo(
    () => PUBLIC_PLAN_CARDS.find((card) => card.plan === selectedPlan) ?? PUBLIC_PLAN_CARDS[0],
    [selectedPlan],
  );

  const providerAvailability = useMemo(
    () => ({
      momo: hasConfiguredMomoCheckout(),
      bank_transfer: hasConfiguredBankTransfer(),
    }),
    [],
  );

  async function handleCheckout() {
    if (selectedPlan === "free") {
      navigate(SITE_CONFIG.dashboardPath);
      return;
    }

    if (provider === "momo" && !providerAvailability.momo) {
      toast.error("MoMo chưa được cấu hình trên production. Tạm thời dùng Techcombank chuyển khoản.");
      return;
    }

    if (provider === "bank_transfer" && !providerAvailability.bank_transfer) {
      toast.error("Chuyển khoản ngân hàng chưa được cấu hình trên production.");
      return;
    }

    setLoading(true);
    try {
      const order = await portalStartCheckout({
        plan: selectedPlan,
        billingSku: getDefaultSkuForTier(selectedPlan),
        provider,
        phoneInput: phoneDraft,
      });

      if (order.paymentUrl) {
        window.location.href = order.paymentUrl;
        return;
      }

      const params = new URLSearchParams({
        order: order.id,
        orderCode: order.orderCode,
        plan: selectedPlan,
        provider,
        status: order.status,
        amount: String(order.amount),
      });
      if (order.bankTransferNote) {
        params.set("note", order.bankTransferNote);
      }

      toast.success("Đơn hàng đã được tạo. Tiếp tục sang màn activation để hoàn tất dùng ngay.");
      navigate(`${SITE_CONFIG.activatePath}?${params.toString()}`);
    } catch (error) {
      toast.error(String((error as Error)?.message || "Không thể tạo checkout lúc này."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(249,115,22,0.08),_transparent_24%),linear-gradient(180deg,#f7fbfa_0%,#ffffff_46%,#f8fafc_100%)] px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-[32px] border border-primary/10 bg-white/88 p-8 shadow-md backdrop-blur">
          <div className="mb-3 inline-flex items-center rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
            Pay → Activate → Link channel
          </div>
          <h1 className="text-4xl font-semibold tracking-[-0.05em] text-foreground">
            Chốt gói theo số điện thoại trước, rồi dùng ngay trên Telegram.
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
            Đây là flow production ít ma sát nhất cho CaloTrack: thanh toán xong là plan active ở cấp customer, rồi bạn
            được dẫn thẳng sang màn activation để kết nối Telegram hoặc tạo yêu cầu link Zalo.
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <div className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-3">
              {PUBLIC_PLAN_CARDS.map((card) => {
                const active = card.plan === selectedPlan;
                return (
                  <button
                    key={card.plan}
                    type="button"
                    onClick={() => setSelectedPlan(card.plan)}
                    className={`rounded-[28px] border p-5 text-left transition ${
                      active
                        ? "border-primary bg-primary text-primary-foreground shadow-glow-teal"
                        : card.plan === "lifetime"
                          ? "border-accent/20 bg-white text-foreground hover:border-accent/40"
                          : "border-primary/10 bg-white/85 text-foreground hover:border-primary/25"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xl font-semibold">{card.label}</div>
                      {card.badge ? (
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            active ? "bg-white/15 text-white" : "bg-primary/10 text-primary"
                          }`}
                        >
                          {card.badge}
                        </span>
                      ) : null}
                    </div>
                    <div className={`mt-3 text-2xl font-semibold ${active ? "text-white" : "text-foreground"}`}>
                      {card.priceLabel}
                    </div>
                    <p className={`mt-3 text-sm leading-6 ${active ? "text-white/85" : "text-muted-foreground"}`}>
                      {card.helper}
                    </p>
                    <ul className={`mt-4 space-y-2 text-sm ${active ? "text-white/85" : "text-zinc-600"}`}>
                      {card.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-[32px] border border-primary/10 bg-white/90 p-6 shadow-md backdrop-blur">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Checkout orchestration</div>
            <h2 className="mt-3 text-2xl font-semibold text-foreground">
              {formatTierLabel(selectedPlan)} cho customer theo phone
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Chọn provider thanh toán, xác nhận số điện thoại canonical và để backend xử lý activation bằng callback,
              IPN hoặc reconciliation.
            </p>

            <div className="mt-5 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Số điện thoại canonical</label>
                <Input
                  type="tel"
                  inputMode="tel"
                  value={phoneDraft}
                  onChange={(event) => setPhoneDraft(event.target.value)}
                  placeholder="Ví dụ 0912345678"
                />
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium text-foreground">Payment provider</div>
                <div className="grid gap-3">
                  {PUBLIC_CHECKOUT_PROVIDERS.map((option) => {
                    const active = provider === option.value;
                    const available =
                      option.value === "momo"
                        ? providerAvailability.momo
                        : providerAvailability.bank_transfer;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => available && setProvider(option.value)}
                        disabled={!available}
                        className={`rounded-2xl border p-4 text-left transition ${
                          active
                            ? option.accent === "neutral"
                              ? "border-zinc-300 bg-zinc-50"
                              : "border-primary bg-primary/10"
                            : "border-primary/10 bg-white hover:border-primary/20"
                        } ${!available ? "cursor-not-allowed opacity-60" : ""}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-foreground">{option.label}</div>
                          {active ? (
                            <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
                              đã chọn
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 text-sm leading-6 text-muted-foreground">
                          {available
                            ? option.helper
                            : option.value === "momo"
                              ? "Chưa set webhook tạo payment session trên production."
                              : "Chưa set tài khoản ngân hàng nhận tiền trên production."}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {provider === "bank_transfer" ? (
              <div className="mt-5 rounded-[28px] border border-primary/10 bg-primary/5 p-5">
                <div className="flex items-start gap-3">
                  <Building2 className="mt-1 h-5 w-5 text-primary" />
                  <div className="space-y-2 text-sm leading-6 text-muted-foreground">
                    <div className="font-semibold text-foreground">Chuyển khoản Techcombank</div>
                    <div>
                      Mỗi order sẽ có một mã riêng. Sau khi bấm tạo order, màn activation sẽ hiện VietQR, số tài khoản và
                      nội dung chuyển khoản đúng để đối soát.
                    </div>
                    <div className="grid gap-2 rounded-2xl border border-primary/10 bg-white/80 p-4 text-sm">
                      <div className="flex items-center gap-2 text-foreground">
                        <QrCode className="h-4 w-4 text-primary" />
                        <span>Ngân hàng: {SITE_CONFIG.bankName}</span>
                      </div>
                      <div>Số tài khoản nhận tiền: {SITE_CONFIG.bankAccountNumber}</div>
                      <div>Flow thật: tạo order → hiện QR → chuyển khoản → webhook/Casso hoặc admin xác nhận.</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-[28px] border border-primary/10 bg-primary/5 p-5">
                <div className="flex items-start gap-3">
                  <Smartphone className="mt-1 h-5 w-5 text-primary" />
                  <div className="space-y-2 text-sm leading-6 text-muted-foreground">
                    <div className="font-semibold text-foreground">MoMo wallet checkout</div>
                    <div>
                      Website tạo order trước, sau đó gọi webhook tạo payment session. Khi MoMo gửi IPN thành công,
                      entitlement sẽ bật ngay ở cấp customer.
                    </div>
                    {!providerAvailability.momo ? (
                      <div className="rounded-2xl border border-accent/20 bg-accent/10 p-4 text-accent">
                        Merchant webhook chưa được cấu hình trên production, nên lane live hiện tại vẫn là Techcombank
                        chuyển khoản.
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 rounded-2xl border border-primary/10 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">
              Gói đang chọn: <span className="font-semibold text-foreground">{currentCard.label}</span>. Sau khi thanh
              toán thành công, website sẽ dẫn bạn tới trang activation để dùng ngay trên Telegram hoặc tạo yêu cầu link
              Zalo.
            </div>

            <div className="mt-6 flex gap-3">
              <Button className="flex-1" onClick={handleCheckout} disabled={loading || !phoneDraft.trim()}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                {selectedPlan === "free" ? "Vào dashboard" : "Thanh toán và sang activation"}
              </Button>
              <Button variant="outline" onClick={() => navigate(SITE_CONFIG.dashboardPath)}>
                Quay lại portal
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
