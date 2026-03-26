import { ReactNode } from "react";
import {
  CreditCard,
  Link2,
  MessageSquareShare,
  NotebookPen,
  Phone,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";

import {
  type AdminChannelAccount,
  type AdminCustomer,
  type AdminCustomer360,
  type AdminLinkReview,
  formatAdminPaymentMethod,
  formatAdminPaymentStatus,
  formatAdminSkuLabel,
} from "@/lib/adminApi";
import { formatBillingPriceVnd, getFreeDailyLimit } from "@/lib/billing";
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
  if (value === "linked") return "border-primary/20 bg-primary/10 text-primary";
  if (value === "pending_review" || value === "pending") return "border-accent/20 bg-accent/10 text-accent";
  if (value === "conflict" || value === "failed" || value === "blocked") return "border-red-200 bg-red-50 text-red-700";
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

export function CustomersPanel({
  customers,
  search,
  onSearchChange,
  planFilter,
  onPlanFilterChange,
  statusFilter,
  onStatusFilterChange,
  onOpenSupport,
  onSetFree,
  onGrantPro,
  onGrantLifetime,
  canFinance,
}: {
  customers: AdminCustomer[];
  search: string;
  onSearchChange: (value: string) => void;
  planFilter: "all" | "free" | "pro" | "lifetime";
  onPlanFilterChange: (value: "all" | "free" | "pro" | "lifetime") => void;
  statusFilter: "all" | "active" | "merged" | "blocked";
  onStatusFilterChange: (value: "all" | "active" | "merged" | "blocked") => void;
  onOpenSupport: (customer: AdminCustomer) => void;
  onSetFree: (customerId: number) => void;
  onGrantPro: (customerId: number) => void;
  onGrantLifetime: (customerId: number) => void;
  canFinance: boolean;
}) {
  return (
    <div className={`${SURFACE} space-y-4`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative flex-1">
          <Input placeholder="Tim theo phone, full name..." value={search} onChange={(event) => onSearchChange(event.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={planFilter} onChange={(event) => onPlanFilterChange(event.target.value as "all" | "free" | "pro" | "lifetime")} className="rounded-full border border-primary/15 bg-white px-3 py-2 text-sm">
            <option value="all">Moi plan</option>
            <option value="free">Free</option>
            <option value="pro">Pro</option>
            <option value="lifetime">Lifetime</option>
          </select>
          <select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value as "all" | "active" | "merged" | "blocked")} className="rounded-full border border-primary/15 bg-white px-3 py-2 text-sm">
            <option value="all">Moi trang thai</option>
            <option value="active">Active</option>
            <option value="merged">Merged</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[24px] border border-primary/10">
        <table className="w-full min-w-[1160px] text-left text-sm">
          <thead className="bg-primary/5 text-xs uppercase tracking-[0.18em] text-zinc-500">
            <tr>{["Customer", "Phone", "Plan", "Premium until", "Quota", "Channels", "Portal", "Last activity", "Actions"].map((header) => <th key={header} className="whitespace-nowrap p-3">{header}</th>)}</tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id} className="border-t border-primary/8 align-top hover:bg-primary/5">
                <td className="p-3">
                  <div className="font-semibold">{customer.full_name || `Customer ${customer.id}`}</div>
                  <div className="mt-1 text-xs text-zinc-500">#{customer.id} · {customer.entitlement_source || "compat"}</div>
                </td>
                <td className="p-3">
                  <div className="font-semibold">{customer.phone_display || customer.phone_e164 || "Chua linked phone"}</div>
                  <div className="mt-1 text-xs text-zinc-500">{customer.phone_e164 || "Can customer canonical"}</div>
                </td>
                <td className="p-3"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${planTone(customer.plan)}`}>{customer.plan}</span></td>
                <td className="p-3 text-sm text-zinc-600">{customer.plan === "lifetime" ? "Lifetime sentinel" : formatDate(customer.premium_until)}</td>
                <td className="p-3">
                  <div className="font-semibold">{customer.quota_used_today}/{getFreeDailyLimit()}</div>
                  <div className="mt-1 text-xs text-zinc-500">Shared quota customer-level</div>
                </td>
                <td className="p-3 text-sm text-zinc-600">{customer.channel_count}</td>
                <td className="p-3 text-sm text-zinc-600">{customer.linked_portal_count ? "Da linked" : "Chua linked"}</td>
                <td className="p-3 text-sm text-zinc-600">{formatDate(customer.last_activity)}</td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => onOpenSupport(customer)}>Customer 360</Button>
                    {canFinance ? (
                      <>
                        <Button size="sm" onClick={() => onGrantPro(customer.id)}>Grant Pro</Button>
                        <Button size="sm" variant="outline" onClick={() => onGrantLifetime(customer.id)}>Lifetime</Button>
                        <Button size="sm" variant="outline" onClick={() => onSetFree(customer.id)}>Set Free</Button>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {customers.length === 0 ? <tr><td colSpan={9} className="p-8 text-center text-zinc-500">Chua co customer canonical nao hoac migration chua apply.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ChannelsPanel({
  channels,
  linkReviews,
  filter,
  onFilterChange,
  targetCustomerId,
  onTargetCustomerIdChange,
  onLink,
  onUnlink,
  canSupport,
}: {
  channels: AdminChannelAccount[];
  linkReviews: AdminLinkReview[];
  filter: "all" | "telegram" | "zalo" | "web";
  onFilterChange: (value: "all" | "telegram" | "zalo" | "web") => void;
  targetCustomerId: string;
  onTargetCustomerIdChange: (value: string) => void;
  onLink: (channelAccountId: number, customerId: number) => void;
  onUnlink: (channelAccountId: number) => void;
  canSupport: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <div className={SUBSURFACE}>
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Pending reviews</div>
          <div className="mt-3 text-3xl font-semibold text-accent">{linkReviews.filter((review) => review.status === "pending").length}</div>
        </div>
        <div className={SUBSURFACE}>
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Linked identities</div>
          <div className="mt-3 text-3xl font-semibold text-primary">{channels.filter((channel) => channel.link_status === "linked").length}</div>
        </div>
        <div className={SUBSURFACE}>
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Conflicts</div>
          <div className="mt-3 text-3xl font-semibold text-red-600">{channels.filter((channel) => channel.link_status === "conflict").length}</div>
        </div>
      </div>

      <div className={`${SURFACE} space-y-4`}>
        <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)_auto]">
          <select value={filter} onChange={(event) => onFilterChange(event.target.value as "all" | "telegram" | "zalo" | "web")} className="rounded-2xl border border-primary/15 bg-white px-3 py-2 text-sm">
            <option value="all">Moi channels</option>
            <option value="telegram">Telegram</option>
            <option value="zalo">Zalo</option>
            <option value="web">Web</option>
          </select>
          <Input placeholder="Nhap customer id de link nhanh..." value={targetCustomerId} onChange={(event) => onTargetCustomerIdChange(event.target.value)} />
          {!canSupport ? <div className="rounded-2xl border border-accent/20 bg-accent/10 px-4 py-2 text-sm text-accent">Read-only</div> : null}
        </div>

        <div className="overflow-x-auto rounded-[24px] border border-primary/10">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="bg-primary/5 text-xs uppercase tracking-[0.18em] text-zinc-500">
              <tr>{["Channel", "Identity", "Display", "Phone claim", "Status", "Customer", "Portal", "Last activity", "Actions"].map((header) => <th key={header} className="whitespace-nowrap p-3">{header}</th>)}</tr>
            </thead>
            <tbody>
              {channels.map((channel) => (
                <tr key={channel.id} className="border-t border-primary/8 align-top hover:bg-primary/5">
                  <td className="p-3"><MiniBadge tone={channel.channel === "zalo" ? "accent" : channel.channel === "web" ? "neutral" : "primary"}>{channel.channel}</MiniBadge></td>
                  <td className="p-3">
                    <div className="font-semibold">{channel.platform_user_id}</div>
                    <div className="mt-1 text-xs text-zinc-500">{channel.platform_chat_id || "No chat id"}</div>
                  </td>
                  <td className="p-3 text-sm text-zinc-600">{channel.display_name || "—"}</td>
                  <td className="p-3 text-sm text-zinc-600">{channel.phone_claimed || "—"}</td>
                  <td className="p-3"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(channel.link_status)}`}>{channel.link_status}</span></td>
                  <td className="p-3 text-sm text-zinc-600">{channel.customer_id ? `${channel.customer_phone || "Customer"} · ${channel.customer_plan || "free"}` : "Chua linked"}</td>
                  <td className="p-3 text-sm text-zinc-600">{channel.auth_email || "—"}</td>
                  <td className="p-3 text-sm text-zinc-600">{formatDate(channel.last_activity)}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => onUnlink(channel.id)} disabled={!canSupport || !channel.customer_id}>Unlink</Button>
                      <Button size="sm" onClick={() => targetCustomerId && onLink(channel.id, Number(targetCustomerId))} disabled={!canSupport || !targetCustomerId}>Link vao customer</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {channels.length === 0 ? <tr><td colSpan={9} className="p-8 text-center text-zinc-500">Chua co channel identity nao hoac migration chua apply.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function CustomerSupportPanel({
  customers,
  selectedCustomerId,
  onSelectCustomer,
  customer360,
  loading,
  noteDraft,
  onNoteDraftChange,
  authUserIdDraft,
  onAuthUserIdDraftChange,
  phoneDraft,
  onPhoneDraftChange,
  mergeSourceId,
  onMergeSourceIdChange,
  onRefresh,
  onSetPhone,
  onResetQuota,
  onLinkPortalAuth,
  onAddNote,
  onMergeCustomer,
  canSupport,
}: {
  customers: AdminCustomer[];
  selectedCustomerId: number | null;
  onSelectCustomer: (customerId: number) => void;
  customer360: AdminCustomer360 | null;
  loading: boolean;
  noteDraft: string;
  onNoteDraftChange: (value: string) => void;
  authUserIdDraft: string;
  onAuthUserIdDraftChange: (value: string) => void;
  phoneDraft: string;
  onPhoneDraftChange: (value: string) => void;
  mergeSourceId: string;
  onMergeSourceIdChange: (value: string) => void;
  onRefresh: () => void;
  onSetPhone: () => void;
  onResetQuota: () => void;
  onLinkPortalAuth: () => void;
  onAddNote: () => void;
  onMergeCustomer: () => void;
  canSupport: boolean;
}) {
  const customer = customer360?.customer ?? customers.find((item) => item.id === selectedCustomerId) ?? null;

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className={`${SURFACE} space-y-4`}>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Support console</div>
          <h3 className="mt-2 text-xl font-semibold">Customer 360, notes va repair</h3>
        </div>
        <select value={selectedCustomerId ?? ""} onChange={(event) => onSelectCustomer(Number(event.target.value))} className="w-full rounded-2xl border border-primary/15 bg-white px-3 py-2 text-sm">
          <option value="">Chon customer de xem</option>
          {customers.map((item) => <option key={item.id} value={item.id}>{item.full_name || `Customer ${item.id}`} · {item.phone_display || item.phone_e164 || "No phone"}</option>)}
        </select>
        <Button variant="outline" onClick={onRefresh} disabled={!selectedCustomerId || loading}>
          <RefreshCcw className="mr-2 h-4 w-4" />
          Refresh customer 360
        </Button>
        {!canSupport ? <div className="rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-accent">Role hien tai chi xem duoc, khong thuc hien support actions.</div> : null}

        {customer ? (
          <div className={SUBSURFACE}>
            <div className="font-semibold">{customer.full_name || `Customer ${customer.id}`}</div>
            <div className="text-sm text-zinc-500">{customer.phone_display || customer.phone_e164 || "Chua linked phone"}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${planTone(customer.plan)}`}>{customer.plan}</span>
              <MiniBadge tone="neutral">{customer.channel_count} channels</MiniBadge>
              <MiniBadge tone="accent">{customer.linked_portal_count} portal links</MiniBadge>
            </div>
          </div>
        ) : null}

        <div className={SUBSURFACE}>
          <div className="mb-3 text-sm font-semibold">Repair actions</div>
          <div className="flex flex-col gap-2">
            <Input placeholder="Cap nhat phone canonical..." value={phoneDraft} onChange={(event) => onPhoneDraftChange(event.target.value)} />
            <Button variant="outline" onClick={onSetPhone} disabled={!selectedCustomerId || !canSupport || !phoneDraft.trim()}>
              <Phone className="mr-2 h-4 w-4" />
              Set phone canonical
            </Button>
            <Input placeholder="Auth user id de link portal..." value={authUserIdDraft} onChange={(event) => onAuthUserIdDraftChange(event.target.value)} />
            <Button variant="outline" onClick={onLinkPortalAuth} disabled={!selectedCustomerId || !canSupport || !authUserIdDraft.trim()}>
              <Link2 className="mr-2 h-4 w-4" />
              Link portal auth
            </Button>
            <Button variant="outline" onClick={onResetQuota} disabled={!selectedCustomerId || !canSupport}>
              <ShieldCheck className="mr-2 h-4 w-4" />
              Reset customer quota
            </Button>
            <Input placeholder="Nhap source customer id de merge vao customer dang mo..." value={mergeSourceId} onChange={(event) => onMergeSourceIdChange(event.target.value)} />
            <Button variant="outline" onClick={onMergeCustomer} disabled={!selectedCustomerId || !canSupport || !mergeSourceId.trim()}>
              <MessageSquareShare className="mr-2 h-4 w-4" />
              Merge source to current
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className={`${SURFACE} space-y-4`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Customer 360</div>
              <h3 className="mt-2 text-xl font-semibold">Entitlement, channels va auth links</h3>
            </div>
            {loading ? <MiniBadge tone="accent">Dang tai</MiniBadge> : null}
          </div>
          {!customer ? <div className="text-sm text-zinc-500">Chon mot customer de mo customer 360.</div> : null}
          {customer ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className={SUBSURFACE}>
                <div className="text-sm font-semibold">Entitlement snapshot</div>
                <div className="mt-3 space-y-2 text-sm text-zinc-600">
                  <div>Plan hien tai: <strong>{customer.plan}</strong></div>
                  <div>Premium until: <strong>{customer.plan === "lifetime" ? "Lifetime sentinel" : formatDate(customer.premium_until)}</strong></div>
                  <div>Quota hom nay: <strong>{customer.quota_used_today}/{getFreeDailyLimit()}</strong></div>
                  <div>Last activity: <strong>{formatDate(customer.last_activity)}</strong></div>
                </div>
              </div>
              <div className={SUBSURFACE}>
                <div className="text-sm font-semibold">Portal va conversation</div>
                <div className="mt-3 space-y-2 text-sm text-zinc-600">
                  <div>Portal links: <strong>{customer.linked_portal_count}</strong></div>
                  <div>Auth rows: <strong>{customer360?.linkedAuths.length ?? 0}</strong></div>
                  <div>Conversation state: <strong>{customer360?.conversationState ? "Co snapshot" : "Chua co"}</strong></div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <div className={`${SURFACE} space-y-4`}>
            <div className="flex items-center gap-2">
              <NotebookPen className="h-4 w-4 text-primary" />
              <div className="text-sm font-semibold">Support notes</div>
            </div>
            <textarea value={noteDraft} onChange={(event) => onNoteDraftChange(event.target.value)} placeholder="Ghi note ho tro cho customer nay..." className="min-h-28 w-full rounded-2xl border border-primary/15 bg-white px-3 py-3 text-sm" />
            <Button onClick={onAddNote} disabled={!selectedCustomerId || !canSupport || !noteDraft.trim()}>Luu note</Button>
            <div className="space-y-3">
              {(customer360?.supportNotes ?? []).map((note) => (
                <div key={note.id} className={SUBSURFACE}>
                  <div className="text-sm text-zinc-700">{note.note}</div>
                  <div className="mt-2 text-xs text-zinc-500">{note.actor_display_name || "Admin"} · {formatDate(note.created_at)}</div>
                </div>
              ))}
              {selectedCustomerId && (customer360?.supportNotes?.length ?? 0) === 0 ? <div className="text-sm text-zinc-500">Chua co support note nao.</div> : null}
            </div>
          </div>
          <div className={`${SURFACE} space-y-4`}>
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              <div className="text-sm font-semibold">Payments va channels</div>
            </div>
            <div className="space-y-3">
              {(customer360?.recentPayments ?? []).slice(0, 5).map((payment) => (
                <div key={payment.id} className={SUBSURFACE}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold">{formatAdminSkuLabel(payment.billing_sku || payment.plan_granted)}</div>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(payment.status)}`}>{formatAdminPaymentStatus(payment.status)}</span>
                  </div>
                  <div className="mt-1 text-sm text-zinc-500">{formatBillingPriceVnd(payment.amount)} · {formatAdminPaymentMethod(payment.payment_method)}</div>
                </div>
              ))}
              {(customer360?.channels ?? []).map((channel) => (
                <div key={channel.id} className={SUBSURFACE}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold">{channel.display_name || channel.platform_user_id}</div>
                    <MiniBadge tone={channel.channel === "zalo" ? "accent" : channel.channel === "web" ? "neutral" : "primary"}>{channel.channel}</MiniBadge>
                  </div>
                  <div className="mt-1 text-sm text-zinc-500">{channel.link_status} · {channel.phone_claimed || channel.customer_phone || "No phone claim"}</div>
                </div>
              ))}
              {selectedCustomerId && (customer360?.recentPayments?.length ?? 0) === 0 && (customer360?.channels?.length ?? 0) === 0 ? <div className="text-sm text-zinc-500">Chua co payment hoac channel link cho customer nay.</div> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
