import { useMemo, useState } from "react";

import {
  getAdminCustomerAccessTarget,
  type AdminCustomer,
  type AdminCustomerAccessTarget,
  type AdminProBillingSku,
} from "@/lib/adminApi";
import { getFreeDailyLimit } from "@/lib/billing";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SURFACE = "relative overflow-hidden rounded-[28px] border border-primary/10 bg-white/85 p-5 shadow-md backdrop-blur";

function planTone(plan?: string | null) {
  if (plan === "lifetime") return "border-accent/25 bg-accent/10 text-accent";
  if (plan === "pro") return "border-primary/20 bg-primary/10 text-primary";
  return "border-zinc-200 bg-white text-zinc-600";
}

function accessTone(value: AdminCustomerAccessTarget) {
  if (value === "banned") return "border-red-200 bg-red-50 text-red-700";
  if (value === "pro") return "border-primary/20 bg-primary/10 text-primary";
  return "border-zinc-200 bg-white text-zinc-600";
}

function inferBillingSku(customer: AdminCustomer): AdminProBillingSku {
  if (customer.plan !== "pro" || !customer.premium_until) return "monthly";
  const remainingDays = Math.ceil((Date.parse(customer.premium_until) - Date.now()) / (24 * 60 * 60 * 1000));
  if (remainingDays > 240) return "yearly";
  if (remainingDays > 75) return "semiannual";
  return "monthly";
}

function formatCustomerPlan(customer: AdminCustomer) {
  if (customer.legacy_lifetime) return "Lifetime legacy";
  if (customer.plan === "pro") return "Pro";
  return "Free";
}

function formatPremiumLabel(customer: AdminCustomer) {
  if (customer.legacy_lifetime) return "Legacy lifetime";
  if (customer.plan === "pro" && customer.premium_until) {
    return `Tới ${new Date(customer.premium_until).toLocaleDateString("vi-VN")}`;
  }
  if (customer.access_state === "trialing") return "Đang trial";
  return "Không áp dụng";
}

function formatPortalState(customer: AdminCustomer) {
  if (customer.entitlement_source === "soft_deleted" || customer.deleted_at) return "Đã gỡ khỏi danh sách";
  if (customer.access_state === "blocked" || customer.is_banned) return "Bị chặn";
  if (customer.access_state === "pending_verification") return "Chờ xác thực";
  if (customer.access_state === "trialing") return "Đang trial";
  if (customer.access_state === "active_paid") return "Đã nâng cấp";
  if (customer.access_state === "free_limited") return "Free";
  return customer.access_state || "Đang đồng bộ";
}

export function AdminCustomerAccessPanel(props: {
  customers: AdminCustomer[];
  search: string;
  onSearchChange: (value: string) => void;
  accessFilter: "all" | AdminCustomerAccessTarget;
  onAccessFilterChange: (value: "all" | AdminCustomerAccessTarget) => void;
  customerEmailsById: Record<number, string[]>;
  onSaveAccessState: (
    customerId: number,
    targetState: AdminCustomerAccessTarget,
    billingSku: AdminProBillingSku | null,
  ) => void;
  onRemoveUser: (customerId: number) => void;
  canManageAccess: boolean;
}) {
  const {
    customers,
    search,
    onSearchChange,
    accessFilter,
    onAccessFilterChange,
    customerEmailsById,
    onSaveAccessState,
    onRemoveUser,
    canManageAccess,
  } = props;
  const [drafts, setDrafts] = useState<Record<number, { target: AdminCustomerAccessTarget; billingSku: AdminProBillingSku }>>({});
  const [removeCandidate, setRemoveCandidate] = useState<AdminCustomer | null>(null);

  const rows = useMemo(
    () =>
      customers.map((customer) => ({
        customer,
        currentTarget: getAdminCustomerAccessTarget(customer),
        draft:
          drafts[customer.id] ?? {
            target: getAdminCustomerAccessTarget(customer),
            billingSku: inferBillingSku(customer),
          },
      })),
    [customers, drafts],
  );

  return (
    <div className={`${SURFACE} min-w-0 max-w-full space-y-4`}>
      <div className="flex flex-col gap-4 rounded-[28px] border border-primary/10 bg-primary/5 p-5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
            Customer Access Control
          </div>
          <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-foreground">
            Quản lý truy cập khách hàng
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
            Đổi nhanh trạng thái Free, Pro hoặc Banned cho customer đã xác thực số điện thoại, theo dõi hiệu lực
            hiện tại và gỡ user khỏi bề mặt vận hành mà vẫn giữ lịch sử để support và audit.
          </p>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Input
            placeholder="Tìm theo customer ID, số điện thoại, tên khách hàng hoặc email đăng nhập..."
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
          <select
            value={accessFilter}
            onChange={(event) => onAccessFilterChange(event.target.value as "all" | AdminCustomerAccessTarget)}
            className="rounded-full border border-primary/15 bg-white px-3 py-2 text-sm"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="free">Free</option>
            <option value="pro">Pro</option>
            <option value="banned">Banned</option>
          </select>
        </div>
      </div>

      <div className="relative w-full max-w-full overflow-hidden rounded-[24px] border border-primary/10 bg-white">
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-white via-white/90 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-white via-white/85 to-transparent" />
        <div className="w-full max-w-full overflow-x-auto overscroll-x-contain pb-2">
        <table className="w-full min-w-[1460px] text-left text-sm">
          <thead className="bg-primary/5 text-sm font-semibold text-zinc-600">
            <tr>
              {[
                "Khách hàng",
                "SĐT xác thực",
                "Email đăng nhập",
                "Gói",
                "Hiệu lực",
                "Quota hôm nay",
                "Kênh đã liên kết",
                "Portal",
                "Trạng thái",
                "Thao tác",
              ].map((header) => (
                <th key={header} className="whitespace-nowrap px-4 py-3">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ customer, currentTarget, draft }) => {
              const emails = customerEmailsById[customer.id] ?? [];
              const canSave =
                canManageAccess &&
                (draft.target !== currentTarget ||
                  (draft.target === "pro" && draft.billingSku !== inferBillingSku(customer)));

              return (
                <tr key={customer.id} className="border-t border-primary/8 align-top hover:bg-primary/5">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-foreground">{customer.full_name || `Customer ${customer.id}`}</div>
                    <div className="mt-1 text-xs text-zinc-500">#{customer.id} · {customer.entitlement_source || "customer"}</div>
                    {customer.legacy_lifetime ? (
                      <div className="mt-2">
                        <span className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
                          Lifetime legacy
                        </span>
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-foreground">
                      {customer.phone_display || customer.phone_e164 || "Chưa có số xác thực"}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">{customer.phone_e164 || "Chờ đồng bộ số canonical"}</div>
                  </td>
                  <td className="px-4 py-3">
                    {emails.length ? (
                      <div className="space-y-1">
                        {emails.slice(0, 2).map((email) => (
                          <div key={email} className="text-sm text-zinc-700">
                            {email}
                          </div>
                        ))}
                        {emails.length > 2 ? <div className="text-xs text-zinc-500">+{emails.length - 2} email khác</div> : null}
                      </div>
                    ) : (
                      <span className="text-sm text-zinc-500">Chưa liên kết auth</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${planTone(customer.plan)}`}>
                      {formatCustomerPlan(customer)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-600">{formatPremiumLabel(customer)}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-foreground">
                      {customer.quota_used_today}/{getFreeDailyLimit()}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">Quota chia theo customer truth</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-600">
                    {customer.channel_count} kênh · {customer.linked_portal_count ? "đã có portal" : "chưa có portal"}
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-600">{formatPortalState(customer)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${accessTone(currentTarget)}`}>
                      {currentTarget === "banned" ? "Banned" : currentTarget === "pro" ? "Pro" : "Free"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex min-w-[340px] flex-wrap items-center gap-2">
                      <select
                        value={draft.target}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [customer.id]: {
                              target: event.target.value as AdminCustomerAccessTarget,
                              billingSku: current[customer.id]?.billingSku || inferBillingSku(customer),
                            },
                          }))
                        }
                        className="rounded-full border border-primary/15 bg-white px-3 py-2 text-sm"
                        disabled={!canManageAccess}
                      >
                        <option value="banned">Banned</option>
                        <option value="free">Free</option>
                        <option value="pro">Pro</option>
                      </select>

                      {draft.target === "pro" ? (
                        <select
                          value={draft.billingSku}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [customer.id]: {
                                target: "pro",
                                billingSku: event.target.value as AdminProBillingSku,
                              },
                            }))
                          }
                          className="rounded-full border border-primary/15 bg-white px-3 py-2 text-sm"
                          disabled={!canManageAccess}
                        >
                          <option value="monthly">1 tháng</option>
                          <option value="semiannual">6 tháng</option>
                          <option value="yearly">12 tháng</option>
                        </select>
                      ) : null}

                      <Button
                        size="sm"
                        disabled={!canSave || (draft.target === "pro" && !draft.billingSku)}
                        onClick={() =>
                          onSaveAccessState(
                            customer.id,
                            draft.target,
                            draft.target === "pro" ? draft.billingSku : null,
                          )
                        }
                      >
                        Lưu
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                        disabled={!canManageAccess}
                        onClick={() => setRemoveCandidate(customer)}
                      >
                        Remove user
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {customers.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-8 text-center text-zinc-500">
                  Chưa có customer nào khớp bộ lọc hiện tại.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        </div>
        <div className="border-t border-primary/10 px-4 py-3 text-xs text-zinc-500">
          Kéo ngang trong khung này để xem thêm cột mà không làm tràn toàn bộ trang.
        </div>
      </div>

      <AlertDialog open={Boolean(removeCandidate)} onOpenChange={(open) => !open && setRemoveCandidate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gỡ khách hàng khỏi bề mặt vận hành?</AlertDialogTitle>
            <AlertDialogDescription>
              Thao tác này sẽ soft delete customer, gỡ liên kết portal và chat đang hoạt động,
              nhưng vẫn giữ lịch sử meal, exercise và payment để support và audit về sau.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                if (removeCandidate) {
                  onRemoveUser(removeCandidate.id);
                }
                setRemoveCandidate(null);
              }}
            >
              Remove user
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
