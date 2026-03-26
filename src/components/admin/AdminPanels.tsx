import { ChangeEvent, Dispatch, ReactNode, SetStateAction } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Bot,
  CreditCard,
  Link2,
  NotebookPen,
  RefreshCcw,
  Search,
  ShieldAlert,
  Upload,
  Wallet,
} from "lucide-react";

import {
  type AdminAccessState,
  type AdminAuditLogRow,
  type AdminMember,
  type AdminRole,
  type AdminSystemHealth,
  type AdminUser,
  type AdminUser360,
  type FoodCandidateRow,
  type FoodCatalogRow,
  type FoodCsvDryRunResult,
  type PaymentRow,
  type SchemaReadiness,
  type SubscriptionEvent,
  type SystemStats,
  describeSchemaReadiness,
  formatAdminPaymentMethod,
  formatAdminPaymentStatus,
  formatAdminSkuLabel,
  getQuotaProgressPercent,
  getQuotaThresholdNotice,
} from "@/lib/adminApi";
import { formatBillingPriceVnd, getFreeDailyLimit, type BillingSku } from "@/lib/billing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SURFACE = "rounded-[28px] border border-primary/10 bg-white/85 p-5 shadow-md backdrop-blur";
const SUBSURFACE = "rounded-3xl border border-primary/10 bg-white/80 p-4 shadow-sm";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("vi-VN");
}

function planTone(plan: string | null | undefined) {
  if (plan === "lifetime") return "border-accent/25 bg-accent/10 text-accent";
  if (plan === "pro") return "border-primary/20 bg-primary/10 text-primary";
  return "border-zinc-200 bg-white text-zinc-600";
}

function statusTone(value: string | null | undefined) {
  if (value === "completed") return "border-primary/20 bg-primary/10 text-primary";
  if (value === "pending") return "border-accent/20 bg-accent/10 text-accent";
  if (value === "failed" || value === "cancelled") return "border-red-200 bg-red-50 text-red-700";
  return "border-zinc-200 bg-white text-zinc-600";
}

function MiniBadge({
  children,
  tone = "primary",
}: {
  children: ReactNode;
  tone?: "primary" | "accent" | "neutral" | "danger";
}) {
  const classes =
    tone === "accent"
      ? "border-accent/20 bg-accent/10 text-accent"
      : tone === "danger"
        ? "border-red-200 bg-red-50 text-red-700"
        : tone === "neutral"
          ? "border-zinc-200 bg-white text-zinc-600"
          : "border-primary/15 bg-primary/10 text-primary";
  return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${classes}`}>{children}</span>;
}

function MetricCard({ label, value, helper, tone = "primary" }: { label: string; value: ReactNode; helper?: string; tone?: "primary" | "accent" | "neutral"; }) {
  const valueClass = tone === "accent" ? "text-accent" : tone === "neutral" ? "text-zinc-600" : "text-primary";
  return (
    <div className={SUBSURFACE}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">{label}</div>
      <div className={`mt-3 text-3xl font-semibold tracking-[-0.04em] ${valueClass}`}>{value}</div>
      {helper ? <div className="mt-2 text-sm text-zinc-500">{helper}</div> : null}
    </div>
  );
}

export function OverviewPanel({
  stats,
  users,
  payments,
  health,
  schema,
  onRefresh,
}: {
  stats: SystemStats | null;
  users: AdminUser[];
  payments: PaymentRow[];
  health: AdminSystemHealth | null;
  schema: SchemaReadiness | null;
  onRefresh: () => void;
}) {
  const freeUsers = users.filter((user) => user.plan === "free").length;
  const telegramUsers = users.filter((user) => (user.platform ?? "telegram") === "telegram").length;
  const zaloUsers = users.filter((user) => user.platform === "zalo").length;
  const webUsers = users.filter((user) => user.platform === "web").length;
  const expiringSoon = users.filter((user) => {
    if (!user.premium_until || user.plan === "lifetime") return false;
    const expiry = new Date(user.premium_until);
    return expiry > new Date() && expiry < new Date(Date.now() + 7 * 86400000);
  });
  const pendingPayments = payments.filter((payment) => payment.status === "pending").slice(0, 5);
  const quotaHotspots = users
    .filter((user) => user.plan === "free" && user.daily_ai_usage_count >= getFreeDailyLimit())
    .sort((a, b) => b.daily_ai_usage_count - a.daily_ai_usage_count)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Tổng users" value={stats?.totalUsers ?? users.length} helper="Bao gồm Telegram, Zalo và Web-linked" />
        <MetricCard label="Free / Pro" value={`${freeUsers} / ${stats?.premiumUsers ?? users.filter((user) => user.plan === "pro").length}`} helper="Theo entitlement hiện tại" />
        <MetricCard label="Lifetime" value={stats?.lifetimeUsers ?? users.filter((user) => user.plan === "lifetime").length} helper="One-time entitlement" tone="accent" />
        <MetricCard label="Doanh thu tháng" value={formatBillingPriceVnd(stats?.monthRevenue ?? 0)} helper={`Tổng doanh thu ${formatBillingPriceVnd(stats?.totalRevenue ?? 0)}`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.9fr]">
        <div className={`${SURFACE} space-y-5`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Channel mix</div>
              <h3 className="mt-2 text-xl font-semibold">Telegram, Zalo và lớp web portal</h3>
            </div>
            <Button variant="outline" size="sm" onClick={onRefresh}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className={SUBSURFACE}>
              <div className="flex items-center gap-3"><div className="rounded-2xl bg-primary/10 p-3 text-primary"><Bot className="h-5 w-5" /></div><div><div className="text-sm font-semibold">Telegram</div><div className="text-xs text-zinc-500">Kênh mạnh nhất hiện tại</div></div></div>
              <div className="mt-4 text-3xl font-semibold text-primary">{telegramUsers}</div>
            </div>
            <div className={SUBSURFACE}>
              <div className="flex items-center gap-3"><div className="rounded-2xl bg-accent/10 p-3 text-accent"><Wallet className="h-5 w-5" /></div><div><div className="text-sm font-semibold">Zalo</div><div className="text-xs text-zinc-500">Đưa vào ops scope</div></div></div>
              <div className="mt-4 text-3xl font-semibold text-accent">{zaloUsers}</div>
            </div>
            <div className={SUBSURFACE}>
              <div className="flex items-center gap-3"><div className="rounded-2xl bg-zinc-100 p-3 text-zinc-600"><Link2 className="h-5 w-5" /></div><div><div className="text-sm font-semibold">Web-linked</div><div className="text-xs text-zinc-500">Portal account & billing</div></div></div>
              <div className="mt-4 text-3xl font-semibold text-zinc-700">{webUsers}</div>
            </div>
          </div>
        </div>

        <div className={`${SURFACE} space-y-4`}>
          <div className={`rounded-3xl border px-4 py-3 text-sm ${schema?.ready ? "border-primary/15 bg-primary/8 text-primary" : "border-accent/25 bg-accent/10 text-accent"}`}>
            {describeSchemaReadiness(schema)}
          </div>
          <div className={`${SUBSURFACE} flex items-start gap-3`}><ShieldAlert className="mt-1 h-4 w-4 text-accent" /><div><div className="font-semibold">Payment queue</div><div className="text-sm text-zinc-500">{health?.pendingPayments ?? pendingPayments.length} giao dịch cần rà lại.</div></div></div>
          <div className={`${SUBSURFACE} flex items-start gap-3`}><AlertTriangle className="mt-1 h-4 w-4 text-accent" /><div><div className="font-semibold">Quota anomalies</div><div className="text-sm text-zinc-500">{quotaHotspots.length} free users đã chạm ngưỡng {getFreeDailyLimit()} lượt/ngày.</div></div></div>
          <div className={`${SUBSURFACE} flex items-start gap-3`}><BadgeCheck className="mt-1 h-4 w-4 text-primary" /><div><div className="font-semibold">Expiring soon</div><div className="text-sm text-zinc-500">{expiringSoon.length} Pro users sắp hết hạn trong 7 ngày tới.</div></div></div>
        </div>
      </div>
    </div>
  );
}

export function UsersPanel({
  filteredUsers,
  search,
  onSearchChange,
  planFilter,
  onPlanFilterChange,
  channelFilter,
  onChannelFilterChange,
  statusFilter,
  onStatusFilterChange,
  onExport,
  onBanToggle,
  onAddDays,
  onRemoveDays,
  onOpenSupport,
  onOpenTimeline,
  loading,
  canFinance,
  canSupport,
}: {
  filteredUsers: AdminUser[];
  search: string;
  onSearchChange: (value: string) => void;
  planFilter: "all" | AdminUser["plan"];
  onPlanFilterChange: (value: "all" | AdminUser["plan"]) => void;
  channelFilter: "all" | "telegram" | "zalo" | "web";
  onChannelFilterChange: (value: "all" | "telegram" | "zalo" | "web") => void;
  statusFilter: "all" | "active" | "banned";
  onStatusFilterChange: (value: "all" | "active" | "banned") => void;
  onExport: () => void;
  onBanToggle: (user: AdminUser) => void;
  onAddDays: (userId: number, days: number, billingSku: BillingSku) => void;
  onRemoveDays: (userId: number, days: number) => void;
  onOpenSupport: (user: AdminUser) => void;
  onOpenTimeline: (user: AdminUser) => void;
  loading: boolean;
  canFinance: boolean;
  canSupport: boolean;
}) {
  return (
    <div className={`${SURFACE} space-y-4`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input className="pl-9" placeholder="Tìm theo tên, email, chat_id, platform_id..." value={search} onChange={(event) => onSearchChange(event.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={planFilter} onChange={(event) => onPlanFilterChange(event.target.value as "all" | AdminUser["plan"])} className="rounded-full border border-primary/15 bg-white px-3 py-2 text-sm"><option value="all">Mọi plan</option><option value="free">Free</option><option value="pro">Pro</option><option value="lifetime">Lifetime</option></select>
          <select value={channelFilter} onChange={(event) => onChannelFilterChange(event.target.value as "all" | "telegram" | "zalo" | "web")} className="rounded-full border border-primary/15 bg-white px-3 py-2 text-sm"><option value="all">Mọi kênh</option><option value="telegram">Telegram</option><option value="zalo">Zalo</option><option value="web">Web</option></select>
          <select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value as "all" | "active" | "banned")} className="rounded-full border border-primary/15 bg-white px-3 py-2 text-sm"><option value="all">Mọi trạng thái</option><option value="active">Đang active</option><option value="banned">Đang ban</option></select>
          <Button variant="outline" onClick={onExport}>CSV</Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[24px] border border-primary/10">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-primary/5 text-xs uppercase tracking-[0.18em] text-zinc-500">
            <tr>{["User", "Channel", "Plan", "Premium until", "AI usage", "Linked auth", "Last active", "Actions"].map((header) => <th key={header} className="whitespace-nowrap p-3">{header}</th>)}</tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.id} className="border-t border-primary/8 align-top hover:bg-primary/5">
                <td className="p-3"><div className="font-semibold">{user.first_name || user.username || `User ${user.id}`}</div><div className="mt-1 text-xs text-zinc-500">{user.email || user.platform_id || `ID ${user.id}`}</div></td>
                <td className="p-3"><MiniBadge tone={user.platform === "zalo" ? "accent" : user.platform === "web" ? "neutral" : "primary"}>{user.platform || "telegram"}</MiniBadge></td>
                <td className="p-3"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${planTone(user.plan)}`}>{user.plan}</span></td>
                <td className="p-3 text-sm text-zinc-600">{user.plan === "lifetime" ? "Lifetime sentinel" : formatDate(user.premium_until)}</td>
                <td className="p-3"><div className="text-sm font-semibold">{user.daily_ai_usage_count}/{getFreeDailyLimit()}</div><div className="mt-2 h-2 rounded-full bg-primary/10"><div className="h-full rounded-full bg-primary" style={{ width: `${getQuotaProgressPercent(user.daily_ai_usage_count)}%` }} /></div><div className="mt-2 text-xs text-zinc-500">{getQuotaThresholdNotice(user.daily_ai_usage_count) || "Trong ngưỡng free"}</div></td>
                <td className="p-3 text-sm text-zinc-600">{user.auth_user_id ? "Đã linked" : "Chưa linked"}</td>
                <td className="p-3 text-sm text-zinc-600">{formatDate(user.last_active || user.created_at)}</td>
                <td className="p-3"><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => onOpenTimeline(user)}>Timeline</Button><Button size="sm" variant="outline" onClick={() => onOpenSupport(user)}>Support</Button>{canSupport ? <Button size="sm" variant="outline" className={user.is_banned ? "border-primary/20 text-primary" : "border-red-200 text-red-600"} onClick={() => onBanToggle(user)}>{user.is_banned ? "Unban" : "Ban"}</Button> : null}{canFinance ? <><Button size="sm" onClick={() => onAddDays(user.id, 30, "monthly")} disabled={loading}>+30d</Button><Button size="sm" variant="outline" onClick={() => onRemoveDays(user.id, 7)} disabled={loading}>-7d</Button></> : null}</div></td>
              </tr>
            ))}
            {filteredUsers.length === 0 ? <tr><td colSpan={8} className="p-8 text-center text-zinc-500">Không có user nào khớp filter hiện tại.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PaymentsPanel(props: {
  filteredPayments: PaymentRow[];
  query: string;
  onQueryChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  providerFilter: string;
  onProviderFilterChange: (value: string) => void;
  skuFilter: string;
  onSkuFilterChange: (value: string) => void;
  channelFilter: string;
  onChannelFilterChange: (value: string) => void;
  payForm: { userId: string; amount: string; billingSku: BillingSku; txCode: string; note: string };
  onPayFormChange: (patch: Partial<{ userId: string; amount: string; billingSku: BillingSku; txCode: string; note: string }>) => void;
  skuOptions: { value: string; label: string; priceVnd: number; priceLabel: string; helper: string; tier: string }[];
  onSubmitManualPayment: () => void;
  canFinance: boolean;
  loading: boolean;
}) {
  const { filteredPayments, query, onQueryChange, statusFilter, onStatusFilterChange, providerFilter, onProviderFilterChange, skuFilter, onSkuFilterChange, channelFilter, onChannelFilterChange, payForm, onPayFormChange, skuOptions, onSubmitManualPayment, canFinance, loading } = props;
  const duplicateCodes = filteredPayments.reduce<Record<string, number>>((acc, payment) => {
    if (payment.transaction_code) acc[payment.transaction_code] = (acc[payment.transaction_code] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className={`${SURFACE} space-y-4`}>
        <div><div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Finance console</div><h3 className="mt-2 text-xl font-semibold">Payments và entitlement</h3><p className="mt-2 text-sm leading-6 text-zinc-600">Finance được quyền log giao dịch thủ công, grant Pro/Lifetime và rà các anomalies.</p></div>
        {!canFinance ? <div className="rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-accent">Role hiện tại không có quyền ghi money ledger.</div> : null}
        <Input placeholder="User ID" value={payForm.userId} onChange={(event) => onPayFormChange({ userId: event.target.value })} />
        <Input placeholder="Số tiền (VNĐ)" type="number" value={payForm.amount} onChange={(event) => onPayFormChange({ amount: event.target.value })} />
        <select value={payForm.billingSku} onChange={(event) => onPayFormChange({ billingSku: event.target.value as BillingSku, amount: String(skuOptions.find((option) => option.value === event.target.value)?.priceVnd ?? payForm.amount) })} className="w-full rounded-2xl border border-primary/15 bg-white px-3 py-2 text-sm">
          {skuOptions.map((option) => <option key={option.value} value={option.value}>{option.label} · {option.priceLabel} · {option.helper}</option>)}
        </select>
        <Input placeholder="Mã giao dịch" value={payForm.txCode} onChange={(event) => onPayFormChange({ txCode: event.target.value })} />
        <textarea value={payForm.note} onChange={(event) => onPayFormChange({ note: event.target.value })} placeholder="Ghi chú finance / entitlement..." className="min-h-24 w-full rounded-2xl border border-primary/15 bg-white px-3 py-3 text-sm" />
        <Button className="w-full" onClick={onSubmitManualPayment} disabled={!canFinance || loading}><CreditCard className="mr-2 h-4 w-4" />Ghi giao dịch & cấp gói</Button>
      </div>

      <div className={`${SURFACE} space-y-4`}>
        <div className="grid gap-2 xl:grid-cols-5">
          <Input placeholder="Tìm user / mã giao dịch..." value={query} onChange={(event) => onQueryChange(event.target.value)} />
          <select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value)} className="rounded-2xl border border-primary/15 bg-white px-3 py-2 text-sm"><option value="all">Mọi trạng thái</option><option value="completed">Hoàn thành</option><option value="pending">Pending</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option></select>
          <select value={providerFilter} onChange={(event) => onProviderFilterChange(event.target.value)} className="rounded-2xl border border-primary/15 bg-white px-3 py-2 text-sm"><option value="all">Mọi provider</option><option value="payos">PayOS</option><option value="stripe">Stripe</option><option value="bank_transfer">Chuyển khoản</option><option value="manual_admin">Admin thủ công</option></select>
          <select value={skuFilter} onChange={(event) => onSkuFilterChange(event.target.value)} className="rounded-2xl border border-primary/15 bg-white px-3 py-2 text-sm"><option value="all">Mọi SKU</option>{skuOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          <select value={channelFilter} onChange={(event) => onChannelFilterChange(event.target.value)} className="rounded-2xl border border-primary/15 bg-white px-3 py-2 text-sm"><option value="all">Mọi channel</option><option value="telegram">Telegram</option><option value="zalo">Zalo</option><option value="web">Web</option></select>
        </div>
        <div className="overflow-x-auto rounded-[24px] border border-primary/10">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-primary/5 text-xs uppercase tracking-[0.18em] text-zinc-500">
              <tr>{["User", "Channel", "SKU", "Method", "Amount", "Status", "Tx code", "Provider event", "Entitlement", "Time"].map((header) => <th key={header} className="whitespace-nowrap p-3">{header}</th>)}</tr>
            </thead>
            <tbody>
              {filteredPayments.map((payment) => (
                <tr key={payment.id} className="border-t border-primary/8 align-top hover:bg-primary/5">
                  <td className="p-3"><div className="font-semibold">{payment.user_name || `User ${payment.user_id}`}</div><div className="text-xs text-zinc-500">#{payment.user_id}</div></td>
                  <td className="p-3"><MiniBadge tone={payment.channel === "zalo" ? "accent" : payment.channel === "web" ? "neutral" : "primary"}>{payment.channel || "telegram"}</MiniBadge></td>
                  <td className="p-3"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${planTone(payment.billing_sku || payment.plan_granted)}`}>{formatAdminSkuLabel(payment.billing_sku || payment.plan_granted)}</span></td>
                  <td className="p-3 text-sm text-zinc-600">{formatAdminPaymentMethod(payment.payment_method)}</td>
                  <td className="p-3 font-semibold">{formatBillingPriceVnd(payment.amount)}</td>
                  <td className="p-3"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(payment.status)}`}>{formatAdminPaymentStatus(payment.status)}</span></td>
                  <td className="p-3 text-xs text-zinc-500">{payment.transaction_code || "—"}{payment.transaction_code && duplicateCodes[payment.transaction_code] > 1 ? <span className="ml-2 rounded-full border border-accent/20 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">dup-like</span> : null}</td>
                  <td className="p-3 text-xs text-zinc-500">{payment.provider_event_id || "—"}</td>
                  <td className="p-3 text-xs text-zinc-500">{payment.entitlement_result || payment.plan_granted || "—"}</td>
                  <td className="p-3 text-xs text-zinc-500">{formatDate(payment.completed_at || payment.created_at)}</td>
                </tr>
              ))}
              {filteredPayments.length === 0 ? <tr><td colSpan={10} className="p-8 text-center text-zinc-500">Không có giao dịch nào khớp filter hiện tại.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function CatalogPanel({
  state,
  handlers,
}: {
  state: {
    schemaReady: boolean;
    canCatalogWrite: boolean;
    loading: boolean;
    foods: FoodCatalogRow[];
    candidates: FoodCandidateRow[];
    catalogSearch: string;
    candidateStatus: string;
    selectedFoodId: number | null;
    foodForm: any;
    aliasInput: string;
    nutritionForm: any;
    portionForm: any;
    promoteForm: any;
    csvText: string;
    csvFileName: string;
    csvDryRun: FoodCsvDryRunResult | null;
  };
  handlers: {
    onCatalogSearchChange: (value: string) => void;
    onCandidateStatusChange: (value: string) => void;
    onRefresh: () => void;
    onSelectFood: (food: FoodCatalogRow) => void;
    onResetFoodForms: () => void;
    setFoodForm: Dispatch<SetStateAction<any>>;
    onAliasInputChange: (value: string) => void;
    setNutritionForm: Dispatch<SetStateAction<any>>;
    setPortionForm: Dispatch<SetStateAction<any>>;
    setPromoteForm: Dispatch<SetStateAction<any>>;
    onCsvTextChange: (value: string) => void;
    onSaveFood: () => void;
    onAddAlias: () => void;
    onSaveNutrition: () => void;
    onSavePortion: () => void;
    onLoadCandidateIntoForm: (candidate: FoodCandidateRow) => void;
    onPromoteCandidate: () => void;
    onQuickPromoteCandidate: (candidate: FoodCandidateRow) => void;
    onCsvFile: (event: ChangeEvent<HTMLInputElement>) => void;
    onCsvDryRun: () => void;
    onCsvCommit: () => void;
  };
}) {
  const { schemaReady, canCatalogWrite, loading, foods, candidates, catalogSearch, candidateStatus, selectedFoodId, foodForm, aliasInput, nutritionForm, portionForm, promoteForm, csvText, csvFileName, csvDryRun } = state;
  const { onCatalogSearchChange, onCandidateStatusChange, onRefresh, onSelectFood, onResetFoodForms, setFoodForm, onAliasInputChange, setNutritionForm, setPortionForm, setPromoteForm, onCsvTextChange, onSaveFood, onAddAlias, onSaveNutrition, onSavePortion, onLoadCandidateIntoForm, onPromoteCandidate, onQuickPromoteCandidate, onCsvFile, onCsvDryRun, onCsvCommit } = handlers;

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-6">
        <div className={`${SURFACE} space-y-4`}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div><div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Catalog ops</div><h3 className="mt-2 text-xl font-semibold">Foods, aliases, nutrition, portions</h3></div>
            <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={onRefresh}><RefreshCcw className="mr-2 h-4 w-4" />Refresh</Button><Button variant="outline" onClick={onResetFoodForms}>Food mới</Button></div>
          </div>
          <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_220px]">
            <Input placeholder="Tìm food theo tên, brand, alias..." value={catalogSearch} onChange={(event) => onCatalogSearchChange(event.target.value)} />
            <select value={candidateStatus} onChange={(event) => onCandidateStatusChange(event.target.value)} className="rounded-2xl border border-primary/15 bg-white px-3 py-2 text-sm"><option value="pending">Pending candidates</option><option value="promoted">Promoted</option><option value="all">Tất cả trạng thái</option></select>
          </div>
          <div className="overflow-x-auto rounded-[24px] border border-primary/10">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-primary/5 text-xs uppercase tracking-[0.18em] text-zinc-500"><tr>{["Food", "Type", "Serving", "Macros", "Source", "Aliases"].map((header) => <th key={header} className="whitespace-nowrap p-3">{header}</th>)}</tr></thead>
              <tbody>
                {foods.map((food) => <tr key={food.id} className={`cursor-pointer border-t border-primary/8 hover:bg-primary/5 ${selectedFoodId === food.id ? "bg-primary/8" : ""}`} onClick={() => onSelectFood(food)}><td className="p-3"><div className="font-semibold">{food.name}</div><div className="text-xs text-zinc-500">{food.brand_name || food.category || "—"}</div></td><td className="p-3 text-sm text-zinc-600">{food.food_type || "generic"}</td><td className="p-3 text-sm text-zinc-600">{food.default_serving_grams ?? "—"}g · {food.default_portion_label || "—"}</td><td className="p-3 text-sm text-zinc-600">{food.calories ?? 0} kcal · P {food.protein ?? 0} · C {food.carbs ?? 0} · F {food.fat ?? 0}</td><td className="p-3 text-sm text-zinc-600">{food.primary_source_type || "—"}</td><td className="p-3 text-sm text-zinc-600">{food.alias_count}</td></tr>)}
                {foods.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-zinc-500">Chưa có food nào hoặc migration catalog chưa apply.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className={`${SURFACE} space-y-4`}>
          <div className="flex items-center justify-between gap-3"><div><div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Candidate queue</div><h3 className="mt-2 text-xl font-semibold">Món bot chưa biết trong DB</h3></div><MiniBadge tone="accent">{candidates.length} candidates</MiniBadge></div>
          <div className="grid gap-3">
            {candidates.map((candidate) => <div key={candidate.id} className={`${SUBSURFACE} flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between`}><div><div className="font-semibold">{candidate.suggested_food_name || candidate.raw_name}</div><div className="mt-1 text-sm text-zinc-500">{candidate.raw_portion || "Không rõ khẩu phần"} · {candidate.candidate_type || "search_estimate"} · seen {candidate.usage_count} lần</div></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => onLoadCandidateIntoForm(candidate)}>Nạp vào form</Button><Button onClick={() => onQuickPromoteCandidate(candidate)} disabled={!canCatalogWrite || loading || !schemaReady}>Promote nhanh</Button></div></div>)}
            {candidates.length === 0 ? <div className="text-sm text-zinc-500">Không còn candidate pending nào.</div> : null}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className={`${SURFACE} space-y-4`}>
          <div className="flex items-center justify-between gap-3"><div><div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Catalog editor</div><h3 className="mt-2 text-xl font-semibold">{selectedFoodId ? `Chỉnh food #${selectedFoodId}` : "Tạo food mới"}</h3></div>{!canCatalogWrite ? <MiniBadge tone="accent">Read-only</MiniBadge> : null}</div>
          <Input placeholder="Tên món" value={foodForm.name} onChange={(event) => setFoodForm({ ...foodForm, name: event.target.value })} />
          <div className="grid gap-3 md:grid-cols-2"><Input placeholder="Category" value={foodForm.category} onChange={(event) => setFoodForm({ ...foodForm, category: event.target.value })} /><Input placeholder="Food type" value={foodForm.foodType} onChange={(event) => setFoodForm({ ...foodForm, foodType: event.target.value })} /></div>
          <div className="grid gap-3 md:grid-cols-2"><Input placeholder="Brand name" value={foodForm.brandName} onChange={(event) => setFoodForm({ ...foodForm, brandName: event.target.value })} /><Input placeholder="Default portion label" value={foodForm.defaultPortionLabel} onChange={(event) => setFoodForm({ ...foodForm, defaultPortionLabel: event.target.value })} /></div>
          <div className="grid gap-3 md:grid-cols-3"><Input placeholder="Serving grams" value={foodForm.defaultServingGrams} onChange={(event) => setFoodForm({ ...foodForm, defaultServingGrams: event.target.value })} /><Input placeholder="Source type" value={foodForm.primarySourceType} onChange={(event) => setFoodForm({ ...foodForm, primarySourceType: event.target.value })} /><Input placeholder="Confidence" value={foodForm.primarySourceConfidence} onChange={(event) => setFoodForm({ ...foodForm, primarySourceConfidence: event.target.value })} /></div>
          <textarea value={foodForm.editorNotes} onChange={(event) => setFoodForm({ ...foodForm, editorNotes: event.target.value })} placeholder="Editor notes..." className="min-h-24 w-full rounded-2xl border border-primary/15 bg-white px-3 py-3 text-sm" />
          <label className="flex items-center gap-2 text-sm text-zinc-600"><input type="checkbox" checked={foodForm.isActive} onChange={(event) => setFoodForm({ ...foodForm, isActive: event.target.checked })} />Food đang active</label>
          <Button className="w-full" onClick={onSaveFood} disabled={!canCatalogWrite || loading || !schemaReady}>Lưu food</Button>
          <div className={SUBSURFACE}><div className="mb-3 text-sm font-semibold">Alias</div><div className="flex gap-2"><Input placeholder="Alias mới..." value={aliasInput} onChange={(event) => onAliasInputChange(event.target.value)} /><Button variant="outline" onClick={onAddAlias} disabled={!canCatalogWrite || loading || !schemaReady}>Thêm</Button></div></div>
          <div className={SUBSURFACE}><div className="mb-3 text-sm font-semibold">Nutrition baseline</div><div className="grid gap-3 md:grid-cols-2"><Input placeholder="Serving label" value={nutritionForm.servingLabel} onChange={(event) => setNutritionForm({ ...nutritionForm, servingLabel: event.target.value })} /><Input placeholder="Serving grams" value={nutritionForm.servingGrams} onChange={(event) => setNutritionForm({ ...nutritionForm, servingGrams: event.target.value })} /><Input placeholder="Calories" value={nutritionForm.calories} onChange={(event) => setNutritionForm({ ...nutritionForm, calories: event.target.value })} /><Input placeholder="Protein" value={nutritionForm.protein} onChange={(event) => setNutritionForm({ ...nutritionForm, protein: event.target.value })} /><Input placeholder="Carbs" value={nutritionForm.carbs} onChange={(event) => setNutritionForm({ ...nutritionForm, carbs: event.target.value })} /><Input placeholder="Fat" value={nutritionForm.fat} onChange={(event) => setNutritionForm({ ...nutritionForm, fat: event.target.value })} /></div><Button variant="outline" className="mt-3" onClick={onSaveNutrition} disabled={!canCatalogWrite || loading || !schemaReady}>Lưu nutrition</Button></div>
          <div className={SUBSURFACE}><div className="mb-3 text-sm font-semibold">Portion mapping</div><div className="grid gap-3 md:grid-cols-2"><Input placeholder="Label (vd: 1 lon 250ml)" value={portionForm.label} onChange={(event) => setPortionForm({ ...portionForm, label: event.target.value })} /><Input placeholder="Grams" value={portionForm.grams} onChange={(event) => setPortionForm({ ...portionForm, grams: event.target.value })} /><Input placeholder="Quantity value" value={portionForm.quantityValue} onChange={(event) => setPortionForm({ ...portionForm, quantityValue: event.target.value })} /><Input placeholder="Quantity unit" value={portionForm.quantityUnit} onChange={(event) => setPortionForm({ ...portionForm, quantityUnit: event.target.value })} /></div><Button variant="outline" className="mt-3" onClick={onSavePortion} disabled={!canCatalogWrite || loading || !schemaReady}>Lưu portion</Button></div>
          <div className={SUBSURFACE}><div className="mb-3 text-sm font-semibold">Promote candidate thành food thật</div><div className="grid gap-3 md:grid-cols-2"><Input placeholder="Tên food" value={promoteForm.name} onChange={(event) => setPromoteForm({ ...promoteForm, name: event.target.value })} /><Input placeholder="Category" value={promoteForm.category} onChange={(event) => setPromoteForm({ ...promoteForm, category: event.target.value })} /><Input placeholder="Food type" value={promoteForm.foodType} onChange={(event) => setPromoteForm({ ...promoteForm, foodType: event.target.value })} /><Input placeholder="Brand name" value={promoteForm.brandName} onChange={(event) => setPromoteForm({ ...promoteForm, brandName: event.target.value })} /></div><Input className="mt-3" placeholder="Aliases, cách nhau bởi dấu phẩy" value={promoteForm.aliases} onChange={(event) => setPromoteForm({ ...promoteForm, aliases: event.target.value })} /><Button className="mt-3 w-full" onClick={onPromoteCandidate} disabled={!canCatalogWrite || loading || !schemaReady}>Promote candidate</Button></div>
          <div className={SUBSURFACE}><div className="mb-3 flex items-center justify-between gap-3"><div><div className="text-sm font-semibold">CSV import</div><div className="text-xs text-zinc-500">Dry-run trước, commit sau khi kiểm tra duplicate.</div></div><label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-2 text-sm text-primary"><Upload className="h-4 w-4" />Chọn CSV<input type="file" accept=".csv,text/csv" className="hidden" onChange={onCsvFile} /></label></div>{csvFileName ? <div className="mb-3 text-xs text-zinc-500">File: {csvFileName}</div> : null}<textarea value={csvText} onChange={(event) => onCsvTextChange(event.target.value)} placeholder="food_name,alias_list,brand_name,category,serving_label,serving_grams,calories,protein,carbs,fat,source_type,confidence" className="min-h-40 w-full rounded-2xl border border-primary/15 bg-white px-3 py-3 text-sm" /><div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" onClick={onCsvDryRun} disabled={!canCatalogWrite || loading || !schemaReady}>Dry-run CSV</Button><Button onClick={onCsvCommit} disabled={!canCatalogWrite || loading || !schemaReady}>Commit CSV</Button></div>{csvDryRun ? <div className="mt-4 rounded-2xl border border-primary/10 bg-primary/5 p-4 text-sm text-zinc-600"><div className="grid gap-2 md:grid-cols-2"><div>Total rows: <strong>{csvDryRun.totalRows}</strong></div><div>Valid: <strong>{csvDryRun.validCount}</strong></div><div>Duplicate: <strong>{csvDryRun.duplicateCount}</strong></div><div>New: <strong>{csvDryRun.newCount}</strong></div></div></div> : null}</div>
        </div>
      </div>
    </div>
  );
}

export function SupportPanel({
  users,
  selectedUserId,
  onSelectUser,
  user360,
  loading,
  noteDraft,
  onNoteDraftChange,
  linkAuthValue,
  onLinkAuthValueChange,
  onRefresh,
  onBanToggle,
  onResetQuota,
  onLinkUser,
  onAddNote,
  canSupport,
}: {
  users: AdminUser[];
  selectedUserId: number | null;
  onSelectUser: (userId: number) => void;
  user360: AdminUser360 | null;
  loading: boolean;
  noteDraft: string;
  onNoteDraftChange: (value: string) => void;
  linkAuthValue: string;
  onLinkAuthValueChange: (value: string) => void;
  onRefresh: () => void;
  onBanToggle: (user: AdminUser) => void;
  onResetQuota: () => void;
  onLinkUser: () => void;
  onAddNote: () => void;
  canSupport: boolean;
}) {
  const selectedUser = user360?.user ?? users.find((user) => user.id === selectedUserId) ?? null;
  return (
    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className={`${SURFACE} space-y-4`}>
        <div><div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Support console</div><h3 className="mt-2 text-xl font-semibold">User 360, notes và repair</h3></div>
        <select value={selectedUserId ?? ""} onChange={(event) => onSelectUser(Number(event.target.value))} className="w-full rounded-2xl border border-primary/15 bg-white px-3 py-2 text-sm"><option value="">Chọn user để xem</option>{users.map((user) => <option key={user.id} value={user.id}>{user.first_name || user.username || `User ${user.id}`} · {user.platform || "telegram"}</option>)}</select>
        <Button variant="outline" onClick={onRefresh} disabled={!selectedUserId || loading}><RefreshCcw className="mr-2 h-4 w-4" />Refresh user 360</Button>
        {!canSupport ? <div className="rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-accent">Role hiện tại chỉ xem được, không thực hiện support actions.</div> : null}
        {selectedUser ? <div className={SUBSURFACE}><div className="font-semibold">{selectedUser.first_name || selectedUser.username || `User ${selectedUser.id}`}</div><div className="text-sm text-zinc-500">{selectedUser.email || selectedUser.platform_id || `#${selectedUser.id}`}</div><div className="mt-3 flex flex-wrap gap-2"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${planTone(selectedUser.plan)}`}>{selectedUser.plan}</span><MiniBadge tone={selectedUser.platform === "zalo" ? "accent" : selectedUser.platform === "web" ? "neutral" : "primary"}>{selectedUser.platform || "telegram"}</MiniBadge></div></div> : null}
        <div className={SUBSURFACE}><div className="mb-3 text-sm font-semibold">Actions</div><div className="flex flex-col gap-2"><Button variant="outline" onClick={() => selectedUser && onBanToggle(selectedUser)} disabled={!selectedUser || !canSupport}>{selectedUser?.is_banned ? "Unban user" : "Ban user"}</Button><Button variant="outline" onClick={onResetQuota} disabled={!selectedUser || !canSupport}>Reset daily quota</Button><Input placeholder="Auth user id để repair link" value={linkAuthValue} onChange={(event) => onLinkAuthValueChange(event.target.value)} /><Button variant="outline" onClick={onLinkUser} disabled={!selectedUser || !canSupport || !linkAuthValue.trim()}><Link2 className="mr-2 h-4 w-4" />Link account</Button></div></div>
      </div>

      <div className="space-y-6">
        <div className={`${SURFACE} space-y-4`}>
          <div className="flex items-center justify-between gap-3"><div><div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">User 360</div><h3 className="mt-2 text-xl font-semibold">Entitlement, activity, notes</h3></div>{loading ? <MiniBadge tone="accent">Đang tải</MiniBadge> : null}</div>
          {!selectedUser ? <div className="text-sm text-zinc-500">Chọn một user để mở user 360.</div> : null}
          {selectedUser ? <div className="grid gap-4 md:grid-cols-2"><div className={SUBSURFACE}><div className="text-sm font-semibold">Entitlement snapshot</div><div className="mt-3 space-y-2 text-sm text-zinc-600"><div>Plan hiện tại: <strong>{selectedUser.plan}</strong></div><div>Premium until: <strong>{selectedUser.plan === "lifetime" ? "Lifetime sentinel" : formatDate(selectedUser.premium_until)}</strong></div><div>AI usage hôm nay: <strong>{selectedUser.daily_ai_usage_count}/{getFreeDailyLimit()}</strong></div><div>Linked auth: <strong>{user360?.linkedAuthState?.auth_user_id ? "Đã linked" : "Chưa linked"}</strong></div></div></div><div className={SUBSURFACE}><div className="text-sm font-semibold">Conversation state</div>{user360?.conversationState ? <div className="mt-3 space-y-2 text-sm text-zinc-600"><div>Surface: <strong>{String(user360.conversationState.response_surface ?? "—")}</strong></div><div>Focus: <strong>{String(user360.conversationState.conversation_focus ?? "—")}</strong></div><div>Updated: <strong>{formatDate(user360.conversationState.updated_at as string | null)}</strong></div></div> : <div className="mt-3 text-sm text-zinc-500">Chưa có snapshot conversation state.</div>}</div></div> : null}
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <div className={`${SURFACE} space-y-4`}><div className="flex items-center gap-2"><NotebookPen className="h-4 w-4 text-primary" /><div className="text-sm font-semibold">Support notes</div></div><textarea value={noteDraft} onChange={(event) => onNoteDraftChange(event.target.value)} placeholder="Ghi note hỗ trợ cho user này..." className="min-h-28 w-full rounded-2xl border border-primary/15 bg-white px-3 py-3 text-sm" /><Button onClick={onAddNote} disabled={!selectedUser || !canSupport || !noteDraft.trim()}>Lưu note</Button><div className="space-y-3">{(user360?.supportNotes ?? []).map((note) => <div key={note.id} className={SUBSURFACE}><div className="text-sm text-zinc-700">{note.note}</div><div className="mt-2 text-xs text-zinc-500">{note.actor_display_name || "Admin"} · {formatDate(note.created_at)}</div></div>)}{selectedUser && (user360?.supportNotes?.length ?? 0) === 0 ? <div className="text-sm text-zinc-500">Chưa có support note nào.</div> : null}</div></div>
          <div className={`${SURFACE} space-y-4`}><div className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary" /><div className="text-sm font-semibold">Payments & timeline</div></div><div className="space-y-3">{(user360?.recentPayments ?? []).slice(0, 5).map((payment) => <div key={payment.id} className={SUBSURFACE}><div className="flex items-center justify-between gap-3"><div className="font-semibold">{formatAdminSkuLabel(payment.billing_sku || payment.plan_granted)}</div><span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(payment.status)}`}>{formatAdminPaymentStatus(payment.status)}</span></div><div className="mt-1 text-sm text-zinc-500">{formatBillingPriceVnd(payment.amount)} · {formatAdminPaymentMethod(payment.payment_method)}</div></div>)}{(user360?.subscriptionEvents ?? []).slice(0, 5).map((event: SubscriptionEvent) => <div key={event.id} className={SUBSURFACE}><div className="font-semibold">{event.event_type}</div><div className="mt-1 text-sm text-zinc-500">{event.plan_from || "free"} → {event.plan_to || "free"} · {formatDate(event.created_at)}</div></div>)}{selectedUser && (user360?.recentPayments?.length ?? 0) === 0 && (user360?.subscriptionEvents?.length ?? 0) === 0 ? <div className="text-sm text-zinc-500">Chưa có payment hoặc timeline cho user này.</div> : null}</div></div>
        </div>
      </div>
    </div>
  );
}

export function SystemPanel({
  schema,
  health,
  auditLogs,
  onRefresh,
}: {
  schema: SchemaReadiness | null;
  health: AdminSystemHealth | null;
  auditLogs: AdminAuditLogRow[];
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Schema" value={health?.schemaReady ? "Ready" : "Pending"} helper={schema?.ready ? "Core tables and RPCs ready" : `${schema?.missing.length ?? 0} hạng mục còn thiếu`} />
        <MetricCard label="Webhook gần nhất" value={health?.lastWebhookAt ? new Date(health.lastWebhookAt).toLocaleDateString("vi-VN") : "—"} helper="Dùng để rà ingest/payment sync" />
        <MetricCard label="Audit rows" value={auditLogs.length} helper="Recent admin write actions" tone="neutral" />
        <MetricCard label="Failed events" value={health?.failedPaymentEvents ?? 0} helper="Failed payment / provider anomalies" tone="accent" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className={`${SURFACE} space-y-4`}>
          <div className="flex items-center justify-between gap-3">
            <div><div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">System health</div><h3 className="mt-2 text-xl font-semibold">Schema, sync và pipeline signals</h3></div>
            <Button variant="outline" onClick={onRefresh}><RefreshCcw className="mr-2 h-4 w-4" />Refresh</Button>
          </div>
          <div className={`${SUBSURFACE} space-y-2 text-sm text-zinc-600`}>
            <div className="flex items-center justify-between"><span>Schema readiness</span><strong>{schema?.ready ? "Ready" : "Pending"}</strong></div>
            <div className="flex items-center justify-between"><span>Pending payments</span><strong>{health?.pendingPayments ?? 0}</strong></div>
            <div className="flex items-center justify-between"><span>Duplicate-like payments</span><strong>{health?.duplicateLikePayments ?? 0}</strong></div>
            <div className="flex items-center justify-between"><span>Catalog candidates pending</span><strong>{health?.catalogCandidatesPending ?? 0}</strong></div>
            <div className="flex items-center justify-between"><span>AI calls hôm nay</span><strong>{health?.aiCallsToday ?? 0}</strong></div>
          </div>
          {!schema?.ready ? <div className="rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-accent">{describeSchemaReadiness(schema)}</div> : null}
        </div>

        <div className={`${SURFACE} space-y-4`}>
          <div><div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Audit log</div><h3 className="mt-2 text-xl font-semibold">Admin actions gần đây</h3></div>
          <div className="space-y-3">
            {auditLogs.map((log) => <div key={log.id} className={SUBSURFACE}><div className="flex items-center justify-between gap-3"><div className="font-semibold">{log.action}</div><div className="text-xs text-zinc-500">{formatDate(log.created_at)}</div></div><div className="mt-2 text-sm text-zinc-500">{log.actor_display_name || "Admin"} · {log.target_type || "general"} {log.target_id ? `#${log.target_id}` : ""}</div></div>)}
            {auditLogs.length === 0 ? <div className="text-sm text-zinc-500">Chưa có audit log hoặc RPC chưa apply.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SettingsPanel({
  access,
  members,
  memberForm,
  onMemberFormChange,
  onSaveMember,
  onToggleMemberActive,
  onApplyRoles,
  canManageMembers,
  skuOptions,
}: {
  access: AdminAccessState | null;
  members: AdminMember[];
  memberForm: { linkedUserId: string; authUserId: string; displayName: string; roles: AdminRole[]; isOwner: boolean };
  onMemberFormChange: (patch: Partial<{ linkedUserId: string; authUserId: string; displayName: string; roles: AdminRole[]; isOwner: boolean }>) => void;
  onSaveMember: () => void;
  onToggleMemberActive: (member: AdminMember) => void;
  onApplyRoles: (member: AdminMember, roles: AdminRole[]) => void;
  canManageMembers: boolean;
  skuOptions: { value: string; label: string; priceLabel: string; helper: string; tier: string }[];
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <div className={`${SURFACE} space-y-4`}>
        <div><div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Settings</div><h3 className="mt-2 text-xl font-semibold">Admin members và quyền hạn</h3></div>
        {!canManageMembers ? <div className="rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-accent">Chỉ bootstrap owner mới quản lý admin members.</div> : null}
        <Input placeholder="Linked user ID" value={memberForm.linkedUserId} onChange={(event) => onMemberFormChange({ linkedUserId: event.target.value })} />
        <Input placeholder="Auth user id (optional)" value={memberForm.authUserId} onChange={(event) => onMemberFormChange({ authUserId: event.target.value })} />
        <Input placeholder="Display name" value={memberForm.displayName} onChange={(event) => onMemberFormChange({ displayName: event.target.value })} />
        <div className="flex flex-wrap gap-2">
          {(["finance", "catalog", "support"] as AdminRole[]).map((role) => {
            const active = memberForm.roles.includes(role);
            return <button key={role} type="button" onClick={() => onMemberFormChange({ roles: active ? memberForm.roles.filter((item) => item !== role) : [...memberForm.roles, role] })} className={`rounded-full border px-3 py-2 text-sm ${active ? "border-primary bg-primary text-primary-foreground" : "border-primary/15 bg-white text-zinc-600"}`}>{role}</button>;
          })}
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-600"><input type="checkbox" checked={memberForm.isOwner} onChange={(event) => onMemberFormChange({ isOwner: event.target.checked })} />Bootstrap owner / break-glass account</label>
        <Button onClick={onSaveMember} disabled={!canManageMembers}>Lưu admin member</Button>
      </div>

      <div className="space-y-6">
        <div className={`${SURFACE} space-y-4`}>
          <div><div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Members</div><h3 className="mt-2 text-xl font-semibold">Danh sách admin hiện tại</h3></div>
          <div className="space-y-3">
            {members.map((member) => (
              <div key={member.id} className={SUBSURFACE}>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div><div className="font-semibold">{member.display_name || member.email || member.username || `Member ${member.id}`}</div><div className="text-sm text-zinc-500">{member.email || member.username || `linked user ${member.linked_user_id ?? "—"}`}</div></div>
                  <div className="flex flex-wrap gap-2">{member.roles.map((role) => <MiniBadge key={role} tone={role === "catalog" ? "accent" : "primary"}>{role}</MiniBadge>)}{member.is_owner ? <MiniBadge tone="accent">owner</MiniBadge> : null}</div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(["finance", "catalog", "support"] as AdminRole[]).map((role) => {
                    const active = member.roles.includes(role);
                    return <button key={role} type="button" onClick={() => onApplyRoles(member, active ? member.roles.filter((item) => item !== role) : [...member.roles, role])} disabled={!canManageMembers} className={`rounded-full border px-3 py-2 text-sm ${active ? "border-primary bg-primary text-primary-foreground" : "border-primary/15 bg-white text-zinc-600"}`}>{role}</button>;
                  })}
                  <Button variant="outline" onClick={() => onToggleMemberActive(member)} disabled={!canManageMembers}>{member.is_active ? "Deactivate" : "Activate"}</Button>
                </div>
              </div>
            ))}
            {members.length === 0 ? <div className="text-sm text-zinc-500">Chưa có member nào ngoài bootstrap owner fallback.</div> : null}
          </div>
        </div>

        <div className={`${SURFACE} space-y-4`}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Readonly billing config</div>
          <div className="grid gap-3 md:grid-cols-2">{skuOptions.map((option) => <div key={option.value} className={SUBSURFACE}><div className="font-semibold">{option.label}</div><div className="mt-1 text-sm text-zinc-500">{option.priceLabel} · {option.helper}</div><div className="mt-3 text-xs uppercase tracking-[0.18em] text-primary">{option.tier}</div></div>)}</div>
          <div className="rounded-2xl border border-primary/10 bg-primary/5 px-4 py-3 text-sm text-zinc-600">Logged in as <strong>{access?.email || "unknown"}</strong>. Role model dùng Finance / Catalog / Support, còn <strong>users.is_admin</strong> giữ làm bootstrap owner gate.</div>
        </div>
      </div>
    </div>
  );
}
