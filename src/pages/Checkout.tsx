import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Copy, Loader2, ShieldCheck, X, Lock, Check } from "lucide-react";
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
import { buildVietQrImageUrl } from "@/lib/siteConfig";
import { usePortalSiteConfig } from "@/contexts/PortalSiteConfigContext";

// QR URL is built via shared siteConfig helper (consistent bank config)
function buildCheckoutQRUrl(
  amount: number,
  note: string,
  bankCode: string,
  bankAccountNumber: string,
  bankAccountName: string,
): string {
  // Prefer siteConfig helper (uses env vars, correct bank)
  const fromConfig = buildVietQrImageUrl(amount, note);
  if (fromConfig) return fromConfig;
  // Absolute fallback — should never hit if env configured
  const encoded = encodeURIComponent(note);
  return (
    `https://img.vietqr.io/image/${encodeURIComponent(bankCode)}-${encodeURIComponent(bankAccountNumber)}-qr_only.png` +
    `?amount=${amount}&addInfo=${encoded}&accountName=${encodeURIComponent(bankAccountName)}`
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
  bankCode: string;
  bankAccountNumber: string;
  bankAccountName: string;
  onConfirm: () => void;
  onClose: () => void;
  confirmLoading: boolean;
}

function QRModal({
  amount,
  note,
  bankCode,
  bankAccountNumber,
  bankAccountName,
  onConfirm,
  onClose,
  confirmLoading,
}: QRModalProps) {
  const qrUrl = buildCheckoutQRUrl(amount, note, bankCode, bankAccountNumber, bankAccountName);
  const stk = bankAccountNumber;
  const bankName = bankAccountName;

  const rows = [
    { label: "SỐ TÀI KHOẢN", value: stk, copy: true },
    { label: "TÊN TÀI KHOẢN", value: bankName, copy: false },
    {
      label: "SỐ TIỀN",
      value: amount.toLocaleString("vi-VN") + " ₫",
      highlight: true,
      copy: false,
    },
    { label: "NỘI DUNG CHUYỂN KHOẢN", value: note, copy: true },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-sm transition-all">
      <div className="relative w-full max-w-md overflow-hidden rounded-[32px] bg-white shadow-2xl ring-1 ring-zinc-200">
        <div className="border-b border-primary/10 bg-primary/5 px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-primary">
              <Lock className="h-4 w-4" />
              Thanh toán An Toàn
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <h2 className="mt-2 text-xl font-bold text-zinc-900">Chuyển khoản {bankCode}</h2>
          <p className="mt-0.5 text-sm text-zinc-600">
            Sử dụng app ngân hàng quét mã QR bên dưới để thanh toán.
          </p>
        </div>

        <div className="p-6">
          <div className="flex justify-center">
            <div className="rounded-2xl border border-primary/15 bg-white p-4 shadow-sm">
              <img
                src={qrUrl}
                alt={`VietQR ${bankCode}`}
                className="h-48 w-48 object-contain"
              />
            </div>
          </div>

          <div className="mt-6 divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-zinc-50/50">
            {rows.map((row) => (
              <div key={row.label} className="flex items-center justify-between px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-500">
                    {row.label}
                  </div>
                  <div
                    className={`mt-0.5 truncate text-sm font-semibold ${
                      row.highlight ? "text-base text-primary" : "text-zinc-900"
                    }`}
                  >
                    {row.value}
                  </div>
                </div>
                {row.copy && (
                  <button
                    onClick={() =>
                      copyToClipboard(row.label === "SỐ TÀI KHOẢN" ? stk : note, row.label.toLowerCase())
                    }
                    className="ml-3 flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-semibold text-zinc-600 shadow-sm transition hover:bg-zinc-50 hover:text-zinc-900"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl bg-blue-50 p-3 text-center text-xs leading-5 text-blue-800">
            Ghi chuẩn <strong>Nội dung chuyển khoản</strong> để hệ thống tự động kích hoạt gói ngay lập tức.
          </div>

          <div className="mt-6 flex gap-3">
            <Button variant="outline" onClick={onClose} className="h-12 flex-1 rounded-xl text-zinc-600">
              Quay lại
            </Button>
            <Button
              onClick={onConfirm}
              disabled={confirmLoading}
              className="h-12 flex-1 rounded-xl bg-primary text-white shadow-md transition-all active:scale-[0.98]"
            >
              {confirmLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Đã thanh toán
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Main Checkout
// ────────────────────────────────────────────────────────────
export default function Checkout() {
  const { siteConfig } = usePortalSiteConfig();
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
  const [, setPendingOrderId] = useState<string | null>(null);
  const [, setPendingOrderCode] = useState<string | null>(null);
  const [pendingOrderParams, setPendingOrderParams] = useState<URLSearchParams | null>(null);

  const [loadingCheckout, setLoadingCheckout] = useState(false);
  const [loadingConfirm, setLoadingConfirm] = useState(false);
  const loginTarget = `${siteConfig.loginPath}?next=${encodeURIComponent(
    `${siteConfig.checkoutPath}${window.location.search || ""}`,
  )}`;

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
          toast.error(String((error as Error)?.message || "Không thể tải dữ liệu huấn luyện lúc này."));
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
  const needsPhoneVerification = !user || snapshot?.accessState === "pending_verification";
  const accessLabel =
    snapshot?.accessState === "trialing"
      ? "Đang ở Pro dùng thử 7 ngày"
      : snapshot?.accessState === "free_limited"
        ? "Đang ở Free linh hoạt"
        : snapshot?.accessState === "active_paid"
          ? "Gói huấn luyện đang hoạt động"
          : snapshot?.accessState === "blocked"
            ? "Tài khoản đang tạm khóa"
            : "Chưa xác nhận số điện thoại";

  // Step 1: Create order → show QR modal
  async function handleContinue() {
    if (needsPhoneVerification) {
      toast.error("Bạn cần xác thực số điện thoại trước để mở Pro dùng thử 7 ngày và đồng bộ Zalo.");
      navigate(loginTarget);
      return;
    }
    if (!snapshot) {
      toast.error("Chưa tải được dữ liệu huấn luyện. Vui lòng thử lại sau vài giây.");
      return;
    }
    if (!checkoutEligible) {
      toast.error("Bạn cần xác thực số điện thoại và mở trial trước khi tiếp tục checkout.");
      navigate(loginTarget);
      return;
    }

    const activeTier = currentCard.plan;
    if (activeTier === "free") {
      navigate(siteConfig.dashboardPath);
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

      // Guard: never show a ₫0 QR (would indicate backend bug)
      if (order.amount <= 0) {
        toast.error("Số tiền đơn hàng không hợp lệ. Vui lòng thử lại hoặc liên hệ hỗ trợ.");
        return;
      }

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
    navigate(`${siteConfig.activatePath}?${pendingOrderParams.toString()}`);
  }

  return (
    <>
      {showQR && (
        <QRModal
          amount={qrAmount}
          note={qrNote}
          bankCode={siteConfig.bankCode}
          bankAccountNumber={siteConfig.bankAccountNumber}
          bankAccountName={siteConfig.bankAccountName}
          onClose={() => setShowQR(false)}
          onConfirm={handleConfirmTransfer}
          confirmLoading={loadingConfirm}
        />
      )}

      <div className="min-h-screen flex flex-col items-center bg-zinc-50 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.12),transparent)] px-4 py-10 pb-20">
        
        {/* HERO HEADER */}
        <div className="mb-8 flex w-full max-w-[1100px] flex-col justify-between gap-6 text-center lg:mb-12 lg:flex-row lg:items-end lg:text-left">
          <div className="max-w-2xl">
            <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary backdrop-blur-sm lg:mx-0">
              <ShieldCheck className="h-4 w-4" />
              Thanh toán & Kích hoạt an toàn
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 lg:text-4xl">
              Chọn gói huấn luyện <span className="text-primary">của riêng bạn.</span>
            </h1>
          </div>

          <div className="flex shrink-0 items-center justify-center gap-3 text-sm lg:justify-end">
            <div className="flex items-center gap-3 rounded-2xl border border-primary/10 bg-white/80 p-3.5 shadow-sm backdrop-blur-md">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Lock className="h-5 w-5" />
              </div>
              <div className="text-left">
                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Trạng thái</div>
                <div className="font-bold text-zinc-900">{accessLabel}</div>
              </div>
            </div>
          </div>
        </div>

        {/* MAIN GRID */}
        <div className="grid w-full max-w-[1100px] items-start gap-8 xl:grid-cols-[1.2fr_0.8fr]">
          
          {/* LEFT: PLANS */}
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              {PUBLIC_PLAN_CARDS.map((card) => {
                const active = card.id === selectedCardId;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => setSelectedCardId(card.id)}
                    className={`relative overflow-hidden rounded-[24px] border p-5 text-left transition-all duration-200 ${
                      active
                        ? "scale-[1.02] border-primary bg-primary text-white shadow-xl shadow-primary/20"
                        : card.plan === "lifetime"
                          ? "border-accent/20 bg-white shadow-sm hover:border-accent/40 hover:shadow-md text-zinc-900"
                          : "border-zinc-200 bg-white shadow-sm hover:border-primary/30 hover:shadow-md text-zinc-900"
                    }`}
                  >
                    {active && (
                      <div className="absolute right-0 top-0 p-4">
                        <CheckCircle2 className="h-5 w-5 text-white/50" />
                      </div>
                    )}
                    
                    <div className="text-lg font-bold">{card.label}</div>
                    {card.badge && (
                      <span
                        className={`mt-2 inline-block rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${
                          active ? "bg-white/20 text-white" : "bg-primary/10 text-primary"
                        }`}
                      >
                        {card.badge}
                      </span>
                    )}
                    
                    <div className="mt-4 flex items-baseline gap-1">
                      <span className={`text-3xl font-bold tracking-tight ${active ? "text-white" : "text-zinc-900"}`}>
                        {card.priceLabel}
                      </span>
                    </div>
                    <p className={`mt-2 text-sm leading-relaxed ${active ? "text-white/80" : "text-zinc-500"}`}>
                      {card.helper}
                    </p>
                    
                    <div className={`mt-6 space-y-3 text-sm ${active ? "text-white/90" : "text-zinc-600"}`}>
                      {card.features.map((feature, i) => (
                        <div key={i} className="flex items-start gap-2.5">
                          <Check className={`mt-0.5 h-4 w-4 shrink-0 ${active ? "text-white" : "text-primary"}`} />
                          <span className="leading-5">{feature}</span>
                        </div>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>

            {currentCard.plan === "pro" && (
              <div className="rounded-[24px] border border-primary/10 bg-white/80 p-6 shadow-sm backdrop-blur-xl">
                <div className="mb-4 flex items-center gap-2">
                   <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
                     <CheckCircle2 className="h-3.5 w-3.5" />
                   </div>
                   <h3 className="font-semibold text-zinc-900">Gói Pro: Chọn chu kỳ thanh toán</h3>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {PUBLIC_PRO_CADENCE_OPTIONS.map((option) => {
                    const active = option.sku === selectedProSku;
                    return (
                        <button
                          key={option.sku}
                          onClick={() => setSelectedProSku(option.sku)}
                          className={`relative rounded-2xl border p-4 text-left transition-all ${
                            active
                              ? "border-primary bg-primary/5 shadow-inner ring-1 ring-primary/20"
                              : "border-zinc-200 bg-white hover:border-zinc-300"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`text-sm font-semibold ${active ? "text-primary" : "text-zinc-900"}`}>
                              {option.label}
                            </span>
                            {option.badge && (
                              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-600">
                                {option.badge}
                              </span>
                            )}
                          </div>
                          <div className={`mt-2 text-xl font-bold ${active ? "text-primary" : "text-zinc-900"}`}>
                            {option.priceLabel}
                          </div>
                          <p className="mt-1 text-xs text-zinc-500">{option.helper}</p>
                        </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: ORDER SUMMARY */}
          <div className="sticky top-6">
            <div className="overflow-hidden rounded-[32px] border border-primary/10 bg-white/90 shadow-xl shadow-black/5 ring-1 ring-black/5 backdrop-blur-xl">
              <div className="border-b border-primary/10 bg-primary/5 px-6 py-5">
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Order Summary</div>
                <h2 className="mt-1 text-2xl font-bold text-zinc-900">Chi tiết thanh toán</h2>
              </div>
              
              <div className="space-y-6 px-6 py-6">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Tài khoản kích hoạt (SĐT)</label>
                  <Input
                    type="tel"
                    value={verifiedPhone}
                    disabled
                    placeholder="Chưa xác thực số điện thoại"
                    className="mt-2 h-12 border-zinc-200 bg-zinc-50/50 font-medium text-zinc-900 opacity-100"
                  />
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500">
                    {snapshotLoading ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang kiểm tra...</>
                    ) : checkoutEligible ? (
                      <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Sẵn sàng kích hoạt tự động</>
                    ) : (
                      <><ShieldCheck className="h-3.5 w-3.5 text-amber-500" /> Vui lòng đăng nhập & xác thực</>
                    )}
                  </div>
                  <div className="mt-2 text-xs leading-5 text-zinc-500">
                    Xác thực số điện thoại sẽ mở Pro dùng thử 7 ngày ngay. Sau đó account vẫn về Free linh hoạt nếu chưa nâng cấp.
                  </div>
                </div>

                <div className="rounded-2xl border border-primary/15 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-start justify-between border-b border-zinc-100 pb-3">
                    <div className="text-sm font-semibold text-zinc-900">Gói {currentCard.label}</div>
                    <div className="text-sm font-bold text-primary">
                      {currentCard.plan === "pro" ? activeProOption.priceLabel : currentCard.priceLabel}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-zinc-600">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Lock className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-zinc-900">Chuyển khoản VietQR</div>
                      <div className="text-xs">Bảo mật & Kích hoạt tự động</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <Button
                    className="h-12 w-full rounded-xl text-base font-semibold shadow-md transition-all active:scale-[0.98]"
                    onClick={needsPhoneVerification ? () => navigate(loginTarget) : handleContinue}
                    disabled={loadingCheckout || snapshotLoading || (!needsPhoneVerification && currentCard.plan !== "free" && !checkoutEligible)}
                  >
                    {loadingCheckout ? (
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    ) : needsPhoneVerification ? (
                      <ShieldCheck className="mr-2 h-5 w-5" />
                    ) : (
                      <Lock className="mr-2 h-5 w-5" />
                    )}
                    {needsPhoneVerification
                      ? "Xác thực số điện thoại để tiếp tục"
                      : currentCard.plan === "free"
                        ? "Đến Dashboard"
                        : "Thanh Toán Ngay"}
                  </Button>
                  
                  {!needsPhoneVerification && (
                    <Button
                      variant="ghost"
                      className="h-12 w-full rounded-xl text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                      onClick={() => navigate(user ? siteConfig.dashboardPath : loginTarget)}
                      disabled={currentCard.plan === "free"}
                    >
                      {currentCard.plan === "free"
                        ? "Đến Dashboard"
                        : "Quay lại Dashboard"}
                    </Button>
                  )}
                </div>
              </div>
              
              <div className="border-t border-zinc-100 bg-zinc-50 px-6 py-4 text-center">
                <p className="flex items-center justify-center gap-1.5 text-xs text-zinc-500">
                  <ShieldCheck className="h-4 w-4" /> Giao dịch được mã hóa an toàn 256-bit SSL
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
