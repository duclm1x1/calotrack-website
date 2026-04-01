import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, Copy, Loader2, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import {
  PUBLIC_PLAN_CARDS,
  PUBLIC_PRO_CADENCE_OPTIONS,
  type BillingSku,
} from "@/lib/billing";
import { fetchPortalSnapshot, portalStartCheckout, type PortalSnapshot } from "@/lib/portalApi";
import { SITE_CONFIG } from "@/lib/siteConfig";

// ──────────────────────────────────────────
// VietinBank account — connected via SePay
// SePay requires "SEVQR" prefix in transfer note (API Banking)
// ──────────────────────────────────────────
const BANK = {
  id: "vietinbank",       // VietQR bank slug
  stk: "109884289129",
  name: "LAI MINH DUC",
  template: "qr_only",   // compact VietQR image
};

function buildVietQRUrl(amount: number, note: string) {
  const encoded = encodeURIComponent(note);
  return (
    `https://img.vietqr.io/image/${BANK.id}-${BANK.stk}-${BANK.template}.png` +
    `?amount=${amount}&addInfo=${encoded}&accountName=${encodeURIComponent(BANK.name)}`
  );
}

function copyToClipboard(text: string, label: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success(`Đã copy ${label}`),
    () => toast.error(`Không thể copy ${label}`),
  );
}

function isCheckoutEligible(snapshot: PortalSnapshot | null): boolean {
  if (!snapshot?.customerId) return false;
  if (snapshot.accessState === "pending_verification") return false;
  if (snapshot.accessState === "blocked") return false;
  return true;
}

// ────────────────────────────────────────────────────────────
// QR Payment Modal
// ────────────────────────────────────────────────────────────
interface QRModalProps {
  amount: number;
  note: string;
  onConfirm: () => void;
  onClose: () => void;
  confirmLoading: boolean;
}

function QRModal({ amount, note, onConfirm, onClose, confirmLoading }: QRModalProps) {
  const qrUrl = buildVietQRUrl(amount, note);

  const rows = [
    { label: "SỐ TÀI KHOẢN", value: BANK.stk, copy: true },
    { label: "TÊN TÀI KHOẢN", value: BANK.name, copy: false },
    {
      label: "SỐ TIỀN",
      value: amount.toLocaleString("vi-VN") + " ₫",
      highlight: true,
      copy: false,
    },
    { label: "NỘI DUNG CHUYỂN KHOẢN", value: note, copy: true },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-[32px] bg-white p-6 shadow-2xl">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-1 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
          Quét mã để thanh toán
        </div>
        <h2 className="text-xl font-bold text-foreground">Chuyển khoản VietinBank</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sử dụng app ngân hàng quét mã QR bên dưới
        </p>

        {/* QR Code */}
        <div className="mt-4 flex justify-center">
          <div className="rounded-2xl border border-primary/10 bg-white p-3 shadow-sm">
            <img
              src={qrUrl}
              alt="VietQR VietinBank"
              className="h-52 w-52 rounded-xl object-contain"
            />
          </div>
        </div>

        {/* Bank info rows */}
        <div className="mt-4 divide-y divide-border rounded-2xl border border-border overflow-hidden">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {row.label}
                </div>
                <div
                  className={`mt-0.5 text-sm font-semibold ${
                    row.highlight ? "text-primary" : "text-foreground"
                  }`}
                >
                  {row.value}
                </div>
              </div>
              {row.copy && (
                <button
                  onClick={() => copyToClipboard(
                    row.label === "SỐ TÀI KHOẢN" ? BANK.stk : note,
                    row.label.toLowerCase()
                  )}
                  className="ml-3 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Copy className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        <p className="mt-3 text-center text-xs text-muted-foreground">
          Ghi đúng <span className="font-semibold text-foreground">nội dung chuyển khoản</span> để
          hệ thống tự kích hoạt gói.
        </p>

        {/* Actions */}
        <div className="mt-5 flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Quay lại
          </Button>
          <Button onClick={onConfirm} disabled={confirmLoading} className="flex-1">
            {confirmLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            Xác nhận đã chuyển khoản
          </Button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Main Checkout
// ────────────────────────────────────────────────────────────
export default function Checkout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const initialSku = searchParams.get("sku") || searchParams.get("plan");
  const defaultCardId =
    PUBLIC_PLAN_CARDS.find((card) => card.id === initialSku || card.plan === initialSku)?.id ||
    (["monthly", "semiannual", "yearly"].includes(String(initialSku)) ? "pro" : "free");

  const [selectedCardId, setSelectedCardId] = useState<string>(defaultCardId);
  const [selectedProSku, setSelectedProSku] = useState<BillingSku>(
    ["monthly", "semiannual", "yearly"].includes(String(initialSku))
      ? (initialSku as BillingSku)
      : "monthly",
  );
  const [snapshot, setSnapshot] = useState<PortalSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  // QR modal state
  const [showQR, setShowQR] = useState(false);
  const [qrAmount, setQRAmount] = useState(0);
  const [qrNote, setQRNote] = useState("");
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [pendingOrderCode, setPendingOrderCode] = useState<string | null>(null);
  const [pendingOrderParams, setPendingOrderParams] = useState<URLSearchParams | null>(null);

  const [loadingCheckout, setLoadingCheckout] = useState(false);
  const [loadingConfirm, setLoadingConfirm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadSnapshot() {
      if (!user) { setSnapshot(null); return; }
      setSnapshotLoading(true);
      try {
        const nextSnapshot = await fetchPortalSnapshot({
          id: user.id,
          email: user.email,
          phone: user.phone,
        });
        if (!cancelled) setSnapshot(nextSnapshot);
      } catch (error) {
        if (!cancelled) {
          setSnapshot(null);
          toast.error(String((error as Error)?.message || "Không thể tải customer truth lúc này."));
        }
      } finally {
        if (!cancelled) setSnapshotLoading(false);
      }
    }
    void loadSnapshot();
    return () => { cancelled = true; };
  }, [user]);

  const currentCard = useMemo(
    () => PUBLIC_PLAN_CARDS.find((card) => card.id === selectedCardId) ?? PUBLIC_PLAN_CARDS[0],
    [selectedCardId],
  );
  const activeBillingSku = currentCard.plan === "pro" ? selectedProSku : currentCard.defaultSku;
  const activeProOption =
    PUBLIC_PRO_CADENCE_OPTIONS.find((option) => option.sku === selectedProSku) ??
    PUBLIC_PRO_CADENCE_OPTIONS[0];

  const verifiedPhone = snapshot?.phoneDisplay || snapshot?.phoneE164 || user?.phone || "";
  const checkoutEligible = isCheckoutEligible(snapshot);
  const accessLabel =
    snapshot?.accessState === "trialing"
      ? "Đang ở trial 7 ngày"
      : snapshot?.accessState === "free_limited"
        ? "Đang ở Free giới hạn"
        : snapshot?.accessState === "active_paid"
          ? "Entitlement trả phí đang hoạt động"
          : snapshot?.accessState === "blocked"
            ? "Tài khoản đang bị chặn"
            : "Chưa xác thực số điện thoại";

  // Step 1: Create order → show QR modal
  async function handleContinue() {
    if (!user) {
      toast.error("Bạn cần đăng nhập và xác thực số điện thoại trước khi checkout.");
      navigate(SITE_CONFIG.loginPath);
      return;
    }
    if (!snapshot) {
      toast.error("Chưa tải được customer truth. Vui lòng thử lại sau vài giây.");
      return;
    }
    if (!checkoutEligible) {
      toast.error("Bạn cần xác thực số điện thoại và mở trial trước khi tiếp tục checkout.");
      navigate(SITE_CONFIG.loginPath);
      return;
    }

    const activeTier = currentCard.plan;
    if (activeTier === "free") {
      navigate(SITE_CONFIG.dashboardPath);
      return;
    }

    setLoadingCheckout(true);
    try {
      const order = await portalStartCheckout({
        plan: activeTier,
        billingSku: activeBillingSku,
        provider: "bank_transfer",
        phoneInput: snapshot.phoneE164 || verifiedPhone,
      });

      // Build transfer note with SEVQR prefix for SePay auto-detection
      const transferNote = order.bankTransferNote
        ? `SEVQR ${order.bankTransferNote}`
        : `SEVQR CALO ${order.orderCode}`;

      const params = new URLSearchParams({
        order: order.id,
        orderCode: order.orderCode,
        plan: activeTier,
        provider: "bank_transfer",
        status: order.status,
        amount: String(order.amount),
      });
      if (order.phoneE164) params.set("phone", order.phoneE164);
      if (order.bankTransferNote) params.set("note", order.bankTransferNote);
      if (order.telegramLinkToken) params.set("tg", order.telegramLinkToken);

      // Store order data and show QR modal
      setQRAmount(order.amount);
      setQRNote(transferNote);
      setPendingOrderId(order.id);
      setPendingOrderCode(order.orderCode);
      setPendingOrderParams(params);
      setShowQR(true);
    } catch (error) {
      toast.error(String((error as Error)?.message || "Không thể tạo checkout lúc này."));
    } finally {
      setLoadingCheckout(false);
    }
  }

  // Step 2: User confirms they transferred → navigate to activate
  function handleConfirmTransfer() {
    if (!pendingOrderParams) return;
    setLoadingConfirm(true);
    toast.success("Đơn hàng ghi nhận. Hệ thống sẽ tự kích hoạt sau khi xác nhận thanh toán.");
    navigate(`${SITE_CONFIG.activatePath}?${pendingOrderParams.toString()}`);
  }

  return (
    <>
      {showQR && (
        <QRModal
          amount={qrAmount}
          note={qrNote}
          onClose={() => setShowQR(false)}
          onConfirm={handleConfirmTransfer}
          confirmLoading={loadingConfirm}
        />
      )}

      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(249,115,22,0.08),_transparent_24%),linear-gradient(180deg,#f7fbfa_0%,#ffffff_46%,#f8fafc_100%)] px-4 py-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="rounded-[32px] border border-primary/10 bg-white/88 p-8 shadow-md backdrop-blur">
            <div className="mb-3 inline-flex items-center rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
              Thanh toán &amp; kích hoạt
            </div>
            <h1 className="text-4xl font-semibold tracking-[-0.05em] text-foreground">
              Đăng ký gói cước bằng số điện thoại đã xác thực và dùng ngay trên AI Chat.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
              Portal là nơi xác thực số điện thoại, tạo customer truth và xử lý thanh toán. Sau khi
              entitlement được kích hoạt, bạn dùng chung trên Zalo, Telegram và dashboard mà không
              bị lệch quyền giữa các kênh.
            </p>
            <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-2xl border border-primary/10 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">
                <span className="font-semibold text-foreground">Luồng chuẩn:</span>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Xác thực số điện thoại bằng OTP</li>
                  <li>Tạo customer truth và mở trial 7 ngày</li>
                  <li>Checkout nếu muốn nâng cấp Pro hoặc Lifetime</li>
                  <li>Entitlement được đồng bộ chung cho portal, Zalo và Telegram</li>
                </ul>
              </div>
              <div className="rounded-2xl border border-primary/10 bg-white p-4 text-sm">
                <div className="flex items-center gap-2 text-foreground">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <span className="font-semibold">Trạng thái truy cập</span>
                </div>
                <div className="mt-3 text-zinc-600">{accessLabel}</div>
                <div className="mt-2 text-xs uppercase tracking-[0.18em] text-primary">
                  {snapshot?.plan ? `Plan hiện tại: ${snapshot.plan}` : "Chưa có customer truth"}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
            <div className="space-y-6">
              {/* Plan cards */}
              <div className="grid gap-4 md:grid-cols-3">
                {PUBLIC_PLAN_CARDS.map((card) => {
                  const active = card.id === selectedCardId;
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => setSelectedCardId(card.id)}
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

              {/* Pro cadence selector */}
              {currentCard.plan === "pro" ? (
                <div className="rounded-[28px] border border-primary/10 bg-white/90 p-5 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Chu kỳ Pro</div>
                  <h3 className="mt-3 text-xl font-semibold text-foreground">Chọn cadence cho gói Pro</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Public site chỉ có một tier Pro. Ở checkout, bạn chọn chu kỳ 1 tháng, 6 tháng hoặc
                    12 tháng để backend tính tiền đúng và audit dễ hơn.
                  </p>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {PUBLIC_PRO_CADENCE_OPTIONS.map((option) => {
                      const active = option.sku === selectedProSku;
                      return (
                        <button
                          key={option.sku}
                          type="button"
                          onClick={() => setSelectedProSku(option.sku)}
                          className={`rounded-2xl border p-4 text-left transition ${
                            active
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-primary/10 bg-white hover:border-primary/25"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold text-foreground">{option.label}</div>
                            {option.badge ? (
                              <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
                                {option.badge}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-3 text-lg font-semibold text-foreground">{option.priceLabel}</div>
                          <div className="mt-1 text-sm leading-6 text-muted-foreground">{option.helper}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Right panel: checkout summary */}
            <div className="rounded-[32px] border border-primary/10 bg-white/90 p-6 shadow-md backdrop-blur">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Tiến hành thanh toán</div>
              <h2 className="mt-3 text-2xl font-semibold text-foreground">Đăng ký gói {currentCard.label}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Checkout chỉ dùng số điện thoại đã OTP thành công. Mọi order, entitlement và link
                Zalo/Telegram đều bám vào customer truth đó.
              </p>

              {currentCard.plan === "pro" ? (
                <div className="mt-4 rounded-2xl border border-primary/10 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">
                  <div className="font-semibold text-foreground">Gói đang chọn: Pro {activeProOption.label}</div>
                  <div className="mt-1">{activeProOption.priceLabel} • {activeProOption.helper}</div>
                </div>
              ) : null}

              <div className="mt-5 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Số điện thoại đã xác thực</label>
                  <Input
                    type="tel"
                    inputMode="tel"
                    value={verifiedPhone}
                    disabled
                    placeholder="Bạn cần đăng nhập và xác thực số điện thoại trước"
                  />
                  <div className="text-xs leading-5 text-muted-foreground">
                    {snapshotLoading
                      ? "Đang tải customer truth..."
                      : checkoutEligible
                        ? "Checkout sẽ dùng đúng số này để cấp entitlement và link các kênh chat."
                        : "Bạn cần xác thực số điện thoại và mở trial trước khi checkout."}
                  </div>
                </div>

                {/* Payment method — bank transfer only */}
                <div className="space-y-2">
                  <div className="text-sm font-medium text-foreground">Phương thức thanh toán</div>
                  <div className="rounded-2xl border border-primary bg-primary/10 p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-foreground">Chuyển khoản Ngân Hàng</div>
                      <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
                        đã chọn
                      </span>
                    </div>
                    <div className="mt-2 text-sm leading-6 text-muted-foreground">
                      Thanh toán qua chuyển khoản ngân hàng VietinBank.
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      VietQR + mã đơn hàng để đối soát và kích hoạt tự động.
                    </div>
                  </div>
                </div>
              </div>

              {/* After payment info */}
              <div className="mt-6 rounded-2xl border border-primary/10 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">
                <span className="font-semibold text-foreground">Sau khi thanh toán:</span>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Kích hoạt theo số điện thoại canonical</li>
                  <li>Quyền lợi áp dụng chung cho Zalo, Telegram và portal</li>
                  <li>Dễ support, dễ audit và không bị lệch entitlement giữa các kênh</li>
                </ul>
              </div>

              {/* Actions */}
              <div className="mt-6 flex gap-3">
                <Button
                  className="flex-1"
                  onClick={handleContinue}
                  disabled={loadingCheckout || snapshotLoading || !checkoutEligible}
                >
                  {loadingCheckout ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="mr-2 h-4 w-4" />
                  )}
                  {currentCard.plan === "free" ? "Vào dashboard" : "Tiếp tục"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate(user ? SITE_CONFIG.dashboardPath : SITE_CONFIG.loginPath)}
                >
                  {user ? "Quay lại portal" : "Đăng nhập portal"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
