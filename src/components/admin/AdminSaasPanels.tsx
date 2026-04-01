import { ReactNode, useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, BarChart3, CreditCard, ShieldCheck, Sparkles, Users } from "lucide-react";

import type {
  AdminAccessState,
  AdminAuditLogRow,
  AdminChannelAccount,
  AdminCustomer,
  AdminMember,
  AdminUser,
  PaymentRow,
  SystemStats,
} from "@/lib/adminApi";
import { formatBillingPriceVnd, getFreeDailyLimit, getPlanCard } from "@/lib/billing";

const SURFACE = "rounded-[28px] border border-primary/10 bg-white/85 p-5 shadow-md backdrop-blur";
const SUBSURFACE = "rounded-3xl border border-primary/10 bg-white/80 p-4 shadow-sm";

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

function MetricCard({
  label,
  value,
  helper,
  icon,
  tone = "primary",
}: {
  label: string;
  value: ReactNode;
  helper: string;
  icon: ReactNode;
  tone?: "primary" | "accent" | "neutral" | "danger";
}) {
  const toneClass =
    tone === "accent"
      ? "text-accent"
      : tone === "neutral"
        ? "text-zinc-700"
        : tone === "danger"
          ? "text-red-700"
          : "text-primary";
  return (
    <div className={SUBSURFACE}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">{label}</div>
          <div className={`mt-3 text-3xl font-semibold tracking-[-0.04em] ${toneClass}`}>{value}</div>
          <div className="mt-2 text-sm leading-6 text-zinc-500">{helper}</div>
        </div>
        <div className={`rounded-2xl p-3 ${tone === "accent" ? "bg-accent/10 text-accent" : tone === "danger" ? "bg-red-50 text-red-700" : "bg-primary/10 text-primary"}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function groupRevenueByDay(payments: PaymentRow[]) {
  const map = new Map<string, number>();
  payments.forEach((payment) => {
    const dateKey = new Date(payment.completed_at || payment.created_at).toLocaleDateString("vi-VN");
    map.set(dateKey, (map.get(dateKey) ?? 0) + Number(payment.amount ?? 0));
  });
  return Array.from(map.entries())
    .slice(-7)
    .map(([date, revenue]) => ({ date, revenue }));
}

function groupSignupByDay(users: AdminUser[]) {
  const map = new Map<string, number>();
  users.forEach((user) => {
    if (!user.created_at) return;
    const dateKey = new Date(user.created_at).toLocaleDateString("vi-VN");
    map.set(dateKey, (map.get(dateKey) ?? 0) + 1);
  });
  return Array.from(map.entries())
    .slice(-7)
    .map(([date, signups]) => ({ date, signups }));
}

export function SubscriptionsOverviewPanel({
  customers,
  payments,
  stats,
}: {
  customers: AdminCustomer[];
  payments: PaymentRow[];
  stats: SystemStats | null;
}) {
  const freeCount = customers.filter((customer) => customer.plan === "free").length;
  const proCount = customers.filter((customer) => customer.plan === "pro").length;
  const lifetimeCount = customers.filter((customer) => customer.plan === "lifetime").length;
  const pendingPayments = payments.filter((payment) => payment.status === "pending").length;
  const failedPayments = payments.filter((payment) => payment.status === "failed").length;
  const recentUpgrades = payments.filter((payment) => payment.status === "completed").slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Free" value={freeCount} helper="Người dùng đang ở free tier." icon={<Users className="h-5 w-5" />} />
        <MetricCard label="Pro" value={proCount} helper="Entitlement trả phí có thời hạn." icon={<CreditCard className="h-5 w-5" />} />
        <MetricCard label="Lifetime" value={lifetimeCount} helper="One-time entitlement dài hạn." icon={<Sparkles className="h-5 w-5" />} tone="accent" />
        <MetricCard label="MRR / tháng" value={formatBillingPriceVnd(stats?.monthRevenue ?? 0)} helper={`${pendingPayments} pending • ${failedPayments} fail`} icon={<BarChart3 className="h-5 w-5" />} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className={SURFACE}>
          <div className="text-sm font-semibold text-foreground">Plan catalog public</div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {(["free", "pro", "lifetime"] as const).map((tier) => {
              const card = getPlanCard(tier);
              return (
                <div key={tier} className="rounded-3xl border border-primary/10 bg-primary/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-lg font-semibold text-foreground">{card.label}</div>
                    {card.badge ? <MiniBadge tone={tier === "lifetime" ? "accent" : "primary"}>{card.badge}</MiniBadge> : null}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-primary">{card.priceLabel}</div>
                  <div className="mt-2 text-sm leading-6 text-zinc-600">{card.helper}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className={SURFACE}>
          <div className="text-sm font-semibold text-foreground">Upgrade feed gần đây</div>
          <div className="mt-4 space-y-3">
            {recentUpgrades.length === 0 ? (
              <div className="rounded-2xl border border-primary/10 bg-primary/5 p-4 text-sm text-zinc-500">
                Chưa có completed payment gần đây.
              </div>
            ) : (
              recentUpgrades.map((payment) => (
                <div key={payment.id} className="rounded-2xl border border-primary/10 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-foreground">{payment.user_name || `User ${payment.user_id}`}</div>
                    <MiniBadge tone={payment.plan_granted === "lifetime" ? "accent" : "primary"}>
                      {payment.plan_granted || payment.billing_sku || "pro"}
                    </MiniBadge>
                  </div>
                  <div className="mt-2 text-sm text-zinc-500">
                    {formatBillingPriceVnd(payment.amount)} • {payment.payment_method} • {payment.status}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function EntitlementsPanel({ customers }: { customers: AdminCustomer[] }) {
  const freeCount = customers.filter((customer) => customer.plan === "free").length;
  const proCount = customers.filter((customer) => customer.plan === "pro").length;
  const lifetimeCount = customers.filter((customer) => customer.plan === "lifetime").length;

  const entitlementRows = [
    {
      key: "ai_meal_analysis",
      free: `Có, tối đa ${getFreeDailyLimit()} lượt/ngày`,
      pro: "Quota cao hơn hoặc không giới hạn theo policy",
      lifetime: "Theo policy cao nhất và giữ dài hạn",
    },
    {
      key: "meal_plan_generator",
      free: "Không",
      pro: "Có",
      lifetime: "Có",
    },
    {
      key: "calorie_history_90d",
      free: "Không",
      pro: "Có",
      lifetime: "Có",
    },
    {
      key: "export_report",
      free: "Không",
      pro: "PDF / CSV",
      lifetime: "PDF / CSV",
    },
    {
      key: "advanced_macro_insights",
      free: "Không",
      pro: "Có",
      lifetime: "Có",
    },
    {
      key: "priority_support",
      free: "Không",
      pro: "Có",
      lifetime: "Có",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Free customers" value={freeCount} helper="Đang dùng feature set cơ bản." icon={<Users className="h-5 w-5" />} />
        <MetricCard label="Pro customers" value={proCount} helper="Có feature flags trả phí." icon={<Sparkles className="h-5 w-5" />} />
        <MetricCard label="Lifetime customers" value={lifetimeCount} helper="One-time entitlement override." icon={<ShieldCheck className="h-5 w-5" />} tone="accent" />
      </div>

      <div className={SURFACE}>
        <div className="text-sm font-semibold text-foreground">Feature flags / entitlement matrix</div>
        <div className="mt-4 overflow-x-auto rounded-[24px] border border-primary/10">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-primary/5 text-xs uppercase tracking-[0.18em] text-zinc-500">
              <tr>
                {["Feature key", "Free", "Pro", "Lifetime"].map((header) => (
                  <th key={header} className="whitespace-nowrap p-3">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entitlementRows.map((row) => (
                <tr key={row.key} className="border-t border-primary/8">
                  <td className="p-3 font-semibold text-foreground">{row.key}</td>
                  <td className="p-3 text-zinc-600">{row.free}</td>
                  <td className="p-3 text-zinc-600">{row.pro}</td>
                  <td className="p-3 text-zinc-600">{row.lifetime}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function UsagePanel({
  customers,
  channels,
  stats,
}: {
  customers: AdminCustomer[];
  channels: AdminChannelAccount[];
  stats: SystemStats | null;
}) {
  const totalUsage = customers.reduce((sum, customer) => sum + customer.quota_used_today, 0);
  const highUsageCustomers = [...customers]
    .sort((a, b) => b.quota_used_today - a.quota_used_today)
    .slice(0, 6);
  const abuseCandidates = customers.filter((customer) => customer.plan === "free" && customer.quota_used_today >= getFreeDailyLimit());
  const estimatedCost = totalUsage * 850;
  const linkedChannels = channels.filter((channel) => channel.link_status === "linked").length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="AI calls hôm nay" value={stats?.todayAICalls ?? totalUsage} helper="Tổng usage đang roll up theo customer." icon={<Sparkles className="h-5 w-5" />} />
        <MetricCard label="Meal scans" value={totalUsage} helper="Dùng như proxy cho image + text meal analysis." icon={<BarChart3 className="h-5 w-5" />} />
        <MetricCard label="Linked channels" value={linkedChannels} helper="Telegram, Zalo và web-linked identities." icon={<Users className="h-5 w-5" />} />
        <MetricCard label="Cost estimate" value={formatBillingPriceVnd(estimatedCost)} helper={`${abuseCandidates.length} free users chạm ngưỡng quota`} icon={<AlertTriangle className="h-5 w-5" />} tone={abuseCandidates.length ? "accent" : "primary"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className={SURFACE}>
          <div className="text-sm font-semibold text-foreground">Hot usage today</div>
          <div className="mt-4 space-y-3">
            {highUsageCustomers.map((customer) => (
              <div key={customer.id} className="rounded-2xl border border-primary/10 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-foreground">{customer.full_name || `Customer ${customer.id}`}</div>
                    <div className="mt-1 text-xs text-zinc-500">{customer.phone_display || customer.phone_e164 || "Chưa có phone"}</div>
                  </div>
                  <MiniBadge tone={customer.plan === "lifetime" ? "accent" : customer.plan === "pro" ? "primary" : "neutral"}>
                    {customer.plan}
                  </MiniBadge>
                </div>
                <div className="mt-3 h-2 rounded-full bg-primary/10">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min(100, Math.max(8, (customer.quota_used_today / Math.max(getFreeDailyLimit(), 1)) * 100))}%` }}
                  />
                </div>
                <div className="mt-2 text-sm text-zinc-500">{customer.quota_used_today} lượt AI hôm nay</div>
              </div>
            ))}
          </div>
        </div>

        <div className={SURFACE}>
          <div className="text-sm font-semibold text-foreground">Quota policy snapshot</div>
          <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-600">
            <div className="rounded-2xl border border-primary/10 bg-primary/5 p-4">
              Free: {getFreeDailyLimit()} lượt AI/ngày, không export, không advanced insights.
            </div>
            <div className="rounded-2xl border border-primary/10 bg-white p-4">
              Pro: quota cao hơn, export, meal plan, insights, support ưu tiên.
            </div>
            <div className="rounded-2xl border border-accent/15 bg-accent/5 p-4">
              Lifetime: entitlement dài hạn, shared quota ở cấp customer, không phụ thuộc renewal.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AnalyticsPanel({
  users,
  customers,
  payments,
}: {
  users: AdminUser[];
  customers: AdminCustomer[];
  payments: PaymentRow[];
}) {
  const signupSeries = useMemo(() => groupSignupByDay(users), [users]);
  const revenueSeries = useMemo(() => groupRevenueByDay(payments.filter((payment) => payment.status === "completed")), [payments]);
  const active7d = users.filter((user) => {
    if (!user.last_active) return false;
    return new Date(user.last_active) >= new Date(Date.now() - 7 * 86400000);
  }).length;
  const active30d = users.filter((user) => {
    if (!user.last_active) return false;
    return new Date(user.last_active) >= new Date(Date.now() - 30 * 86400000);
  }).length;
  const proCustomers = customers.filter((customer) => customer.plan === "pro" || customer.plan === "lifetime").length;
  const conversion = customers.length ? Math.round((proCustomers / customers.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Active 7 ngày" value={active7d} helper="Dựa trên last_active hiện có." icon={<Users className="h-5 w-5" />} />
        <MetricCard label="Active 30 ngày" value={active30d} helper="Theo dấu hiệu hoạt động gần đây." icon={<BarChart3 className="h-5 w-5" />} />
        <MetricCard label="Free → Paid" value={`${conversion}%`} helper="Tính trên customer có Pro hoặc Lifetime." icon={<Sparkles className="h-5 w-5" />} />
        <MetricCard label="Retention signal" value={`${Math.round((active30d / Math.max(users.length, 1)) * 100)}%`} helper="Proxy retention cho phase hiện tại." icon={<ShieldCheck className="h-5 w-5" />} tone="accent" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className={SURFACE}>
          <div className="mb-4 text-sm font-semibold text-foreground">Sign-up trend</div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={signupSeries}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(15,23,42,0.08)" />
                <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 12 }} />
                <YAxis tick={{ fill: "#64748b", fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="signups" fill="rgb(13 148 136)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={SURFACE}>
          <div className="mb-4 text-sm font-semibold text-foreground">Revenue theo ngày</div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueSeries}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(15,23,42,0.08)" />
                <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 12 }} />
                <YAxis tick={{ fill: "#64748b", fontSize: 12 }} />
                <Tooltip formatter={(value) => formatBillingPriceVnd(Number(value ?? 0))} />
                <Area type="monotone" dataKey="revenue" stroke="rgb(249 115 22)" fill="rgba(249,115,22,0.18)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SecurityPanel({
  access,
  members,
  auditLogs,
}: {
  access: AdminAccessState | null;
  members: AdminMember[];
  auditLogs: AdminAuditLogRow[];
}) {
  const recentLogs = auditLogs.slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Admin members" value={members.length} helper="Danh sách account có quyền backoffice." icon={<ShieldCheck className="h-5 w-5" />} />
        <MetricCard label="Current role set" value={access?.roles.length ?? 0} helper="Roles đang gắn trên account hiện tại." icon={<Users className="h-5 w-5" />} />
        <MetricCard label="Owner gate" value={access?.isOwner ? "Owner" : "Role aware"} helper="Bootstrap owner vẫn được giữ để break-glass." icon={<Sparkles className="h-5 w-5" />} tone="accent" />
        <MetricCard label="Audit log" value={auditLogs.length} helper="Recent write actions cần có audit trail." icon={<AlertTriangle className="h-5 w-5" />} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className={SURFACE}>
          <div className="text-sm font-semibold text-foreground">Role model</div>
          <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-600">
            <div className="rounded-2xl border border-primary/10 bg-primary/5 p-4">Owner: full access, role changes, payment review, plan mutation, merge/unlink identities và security settings.</div>
            <div className="rounded-2xl border border-primary/10 bg-white p-4">Admin: vận hành đầy đủ cho customer, entitlement, payment reconciliation, support, linking, quota reset và moderation.</div>
            <div className="rounded-2xl border border-primary/10 bg-white p-4">User: không có quyền backoffice, chỉ là end-user dùng portal và chat surfaces.</div>
          </div>
        </div>

        <div className={SURFACE}>
          <div className="text-sm font-semibold text-foreground">Audit trail gần đây</div>
          <div className="mt-4 overflow-x-auto rounded-[24px] border border-primary/10">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-primary/5 text-xs uppercase tracking-[0.18em] text-zinc-500">
                <tr>
                  {["Time", "Actor", "Action", "Target", "Metadata"].map((header) => (
                    <th key={header} className="whitespace-nowrap p-3">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentLogs.map((row) => (
                  <tr key={row.id} className="border-t border-primary/8">
                    <td className="p-3 text-zinc-500">{row.created_at ? new Date(row.created_at).toLocaleString("vi-VN") : "—"}</td>
                    <td className="p-3 text-zinc-600">{row.actor_display_name || "system"}</td>
                    <td className="p-3 font-semibold text-foreground">{row.action}</td>
                    <td className="p-3 text-zinc-600">{row.target_type || "—"} {row.target_id ?? ""}</td>
                    <td className="p-3 text-zinc-500">{row.metadata ? JSON.stringify(row.metadata).slice(0, 80) : "—"}</td>
                  </tr>
                ))}
                {recentLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-zinc-500">Chưa có audit log hoặc backend chưa apply migration mới.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
