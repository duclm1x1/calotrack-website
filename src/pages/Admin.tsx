import { useEffect, useMemo, useState, useCallback } from "react";
import { toast } from "sonner";

import {
  addDaysToUser,
  describeSchemaReadiness,
  exportUsersCSV,
  fetchAdminUsers,
  fetchPayments,
  getAdminSkuOptions,
  getQuotaProgressPercent,
  getSaasSchemaReadiness,
  getSubscriptionEvents,
  getSystemStats,
  getQuotaThresholdNotice,
  logPayment,
  removeDaysFromUser,
  toggleUserBan,
  type AdminUser,
  type PaymentRow,
  type SchemaReadiness,
  type SubscriptionEvent,
  type SystemStats,
} from "@/lib/adminApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getFreeDailyLimit, type BillingSku } from "@/lib/billing";

type Tab = "overview" | "users" | "payments";

const PLAN_COLORS: Record<AdminUser["plan"], string> = {
  free: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  pro: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  lifetime: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
};

const SKU_OPTIONS = getAdminSkuOptions();
const FREE_DAILY_LIMIT = getFreeDailyLimit();

function formatExpiry(value: string | null) {
  if (!value) return <span className="text-xs text-zinc-400">—</span>;
  const expiry = new Date(value);
  const isPast = expiry < new Date();
  const daysLeft = Math.ceil((expiry.getTime() - Date.now()) / 86400000);
  return (
    <div>
      <div className={`text-xs font-medium ${isPast ? "text-red-500" : daysLeft < 7 ? "text-orange-500" : "text-emerald-500"}`}>
        {expiry.toLocaleDateString("vi-VN")}
      </div>
      {!isPast && <div className="text-xs text-zinc-400">{daysLeft} ngày</div>}
      {isPast && <div className="text-xs text-red-400">Đã hết hạn</div>}
    </div>
  );
}

export default function Admin() {
  const [tab, setTab] = useState<Tab>("overview");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [schema, setSchema] = useState<SchemaReadiness | null>(null);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<"all" | AdminUser["plan"]>("all");
  const [customDays, setCustomDays] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [timelineUser, setTimelineUser] = useState<AdminUser | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<SubscriptionEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [payForm, setPayForm] = useState({
    userId: "",
    amount: "",
    billingSku: "monthly" as BillingSku,
    txCode: "",
    note: "",
  });

  const fetchData = useCallback(async () => {
    const [nextUsers, nextPayments, nextStats, nextSchema] = await Promise.all([
      fetchAdminUsers().catch((error) => {
        toast.error(`Không tải được users: ${String(error?.message || error)}`);
        return [];
      }),
      fetchPayments().catch((error) => {
        toast.error(`Không tải được giao dịch: ${String(error?.message || error)}`);
        return [];
      }),
      getSystemStats().catch(() => null),
      getSaasSchemaReadiness().catch(() => null),
    ]);

    setUsers(nextUsers);
    setPayments(nextPayments);
    setStats(nextStats);
    setSchema(nextSchema);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((user) => {
      const matchesQuery =
        !query ||
        String(user.chat_id ?? "").includes(query) ||
        String(user.platform_id ?? "").includes(query) ||
        (user.username ?? "").toLowerCase().includes(query) ||
        (user.first_name ?? "").toLowerCase().includes(query);
      const matchesPlan = planFilter === "all" || user.plan === planFilter;
      return matchesQuery && matchesPlan;
    });
  }, [users, search, planFilter]);

  const pendingPayments = payments.filter((payment) => payment.status !== "completed").slice(0, 5);
  const quotaHotspots = users
    .filter((user) => user.plan === "free" && user.daily_ai_usage_count >= FREE_DAILY_LIMIT)
    .sort((a, b) => b.daily_ai_usage_count - a.daily_ai_usage_count)
    .slice(0, 5);
  const expiringSoon = users.filter((user) => {
    if (!user.premium_until || user.plan === "lifetime") return false;
    const expiry = new Date(user.premium_until);
    return expiry > new Date() && expiry < new Date(Date.now() + 7 * 86400000);
  });

  const openTimeline = async (user: AdminUser) => {
    setTimelineUser(user);
    setTimelineLoading(true);
    try {
      setTimelineEvents(await getSubscriptionEvents(user.id));
    } finally {
      setTimelineLoading(false);
    }
  };

  const withRefresh = async (fn: () => Promise<void>, successMessage: string) => {
    try {
      setLoading(true);
      await fn();
      toast.success(successMessage);
      await fetchData();
    } catch (error) {
      toast.error(String((error as Error)?.message || error));
    } finally {
      setLoading(false);
    }
  };

  const handleAddDays = async (userId: number, days: number, billingSku: BillingSku) =>
    withRefresh(() => addDaysToUser(userId, days, billingSku, 0, "", "Admin manual adjustment"), `Đã cộng ${days} ngày`);

  const handleRemoveDays = async (userId: number, days: number) =>
    withRefresh(() => removeDaysFromUser(userId, days), `Đã trừ ${days} ngày`);

  const handleBan = async (user: AdminUser) =>
    withRefresh(
      () => toggleUserBan(user.id, !user.is_banned),
      !user.is_banned ? "Đã ban user" : "Đã unban user",
    );

  const handleLogPayment = async () => {
    if (!payForm.userId || !payForm.amount) {
      toast.error("User ID và số tiền là bắt buộc");
      return;
    }
    await withRefresh(
      () =>
        logPayment(
          Number(payForm.userId),
          Number(payForm.amount),
          payForm.billingSku,
          payForm.txCode,
          payForm.note,
        ),
      "Đã ghi giao dịch và cấp gói thành công",
    );
    setPayForm({ userId: "", amount: "", billingSku: "monthly", txCode: "", note: "" });
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "📊 Tổng quan" },
    { key: "users", label: "👥 Users" },
    { key: "payments", label: "💳 Giao dịch" },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 font-sans">
      <div className="bg-white dark:bg-zinc-900 border-b dark:border-zinc-800 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold dark:text-white">🛡️ CaloTrack Admin</h1>
          <p className="text-xs text-zinc-500">Telegram-first SaaS operator console</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {tabs.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === item.key
                  ? "bg-emerald-500 text-white"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className={`rounded-xl border px-4 py-3 text-sm ${
          schema?.ready
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
            : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
        }`}>
          {describeSchemaReadiness(schema)}
        </div>

        {tab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Tổng Users", value: stats?.totalUsers ?? users.length, icon: "👥", color: "text-blue-500" },
                { label: "Pro Users", value: stats?.premiumUsers ?? users.filter((user) => user.plan === "pro").length, icon: "⭐", color: "text-emerald-500" },
                { label: "Lifetime", value: stats?.lifetimeUsers ?? users.filter((user) => user.plan === "lifetime").length, icon: "♾️", color: "text-amber-500" },
                { label: "AI Calls Hôm Nay", value: stats?.todayAICalls ?? 0, icon: "🤖", color: "text-purple-500" },
                { label: "Doanh Thu Tháng", value: `${(stats?.monthRevenue ?? 0).toLocaleString("vi-VN")}đ`, icon: "📈", color: "text-green-500" },
                { label: "Doanh Thu Tổng", value: `${(stats?.totalRevenue ?? 0).toLocaleString("vi-VN")}đ`, icon: "💰", color: "text-yellow-500" },
                { label: "Sắp Hết Hạn", value: stats?.expiringIn7Days ?? expiringSoon.length, icon: "⚠️", color: "text-orange-500" },
                { label: "Free Users", value: users.filter((user) => user.plan === "free").length, icon: "🆓", color: "text-zinc-400" },
              ].map((item) => (
                <div key={item.label} className="bg-white dark:bg-zinc-900 border dark:border-zinc-800 rounded-xl p-4 shadow-sm">
                  <div className="text-2xl mb-1">{item.icon}</div>
                  <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
                  <div className="text-xs text-zinc-500 mt-1">{item.label}</div>
                </div>
              ))}
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              <div className="bg-white dark:bg-zinc-900 border dark:border-zinc-800 rounded-xl p-5 shadow-sm">
                <h3 className="font-semibold dark:text-white mb-4">⚠️ Sắp hết hạn 7 ngày tới</h3>
                <div className="space-y-2">
                  {expiringSoon.slice(0, 5).map((user) => (
                    <div key={user.id} className="flex items-center justify-between py-2 border-b dark:border-zinc-800">
                      <span className="text-sm dark:text-white">{user.first_name || user.username || `User ${user.id}`}</span>
                      <span className="text-xs text-orange-500">{new Date(user.premium_until as string).toLocaleDateString("vi-VN")}</span>
                    </div>
                  ))}
                  {expiringSoon.length === 0 && <p className="text-sm text-zinc-500">Không có user nào sắp hết hạn.</p>}
                </div>
              </div>

              <div className="bg-white dark:bg-zinc-900 border dark:border-zinc-800 rounded-xl p-5 shadow-sm">
                <h3 className="font-semibold dark:text-white mb-4">🧾 Pending / failed payments</h3>
                <div className="space-y-2">
                  {pendingPayments.map((payment) => (
                    <div key={payment.id} className="py-2 border-b dark:border-zinc-800">
                      <div className="text-sm dark:text-white">User {payment.user_id} · {(payment.billing_sku || payment.plan_granted || payment.payment_method) ?? "—"}</div>
                      <div className="text-xs text-zinc-500">
                        {payment.status} · {Number(payment.amount).toLocaleString("vi-VN")}đ
                      </div>
                    </div>
                  ))}
                  {pendingPayments.length === 0 && <p className="text-sm text-zinc-500">Không có giao dịch pending/failed.</p>}
                </div>
              </div>

              <div className="bg-white dark:bg-zinc-900 border dark:border-zinc-800 rounded-xl p-5 shadow-sm">
                <h3 className="font-semibold dark:text-white mb-4">🚨 Quota anomalies</h3>
                <div className="space-y-2">
                  {quotaHotspots.map((user) => (
                    <div key={user.id} className="py-2 border-b dark:border-zinc-800">
                      <div className="text-sm dark:text-white">{user.first_name || user.username || `User ${user.id}`}</div>
                      <div className="text-xs text-zinc-500">
                        {user.daily_ai_usage_count} lượt hôm nay · {getQuotaThresholdNotice(user.daily_ai_usage_count)}
                      </div>
                    </div>
                  ))}
                  {quotaHotspots.length === 0 && <p className="text-sm text-zinc-500">Chưa có anomaly quota nổi bật.</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "users" && (
          <>
            <div className="flex flex-wrap gap-3 items-center">
              <Input
                placeholder="Tìm username, chat_id, platform_id..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="max-w-xs"
              />
              <select
                value={planFilter}
                onChange={(event) => setPlanFilter(event.target.value as "all" | AdminUser["plan"])}
                className="border rounded-md px-3 py-2 text-sm dark:bg-zinc-800 dark:border-zinc-700 dark:text-white"
              >
                <option value="all">Tất cả plans</option>
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="lifetime">Lifetime</option>
              </select>
              <Button variant="outline" onClick={fetchData} size="sm">🔄 Refresh</Button>
              <Button variant="outline" size="sm" onClick={() => exportUsersCSV(filteredUsers as unknown as Record<string, unknown>[])}>
                ⬇️ CSV
              </Button>
              <span className="text-sm text-zinc-500">{filteredUsers.length} users</span>
            </div>

            <div className="bg-white dark:bg-zinc-900 border dark:border-zinc-800 rounded-xl shadow-sm overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-zinc-100 dark:bg-zinc-800 text-xs uppercase text-zinc-500">
                  <tr>
                    {["ID / Platform", "Tên", "Gói", "Hết hạn", "AI hôm nay", "Hoạt động", "Actions"].map((header) => (
                      <th key={header} className="p-3 whitespace-nowrap">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      className={`border-t dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
                        !user.is_active || user.is_banned ? "opacity-50" : ""
                      }`}
                    >
                      <td className="p-3">
                        <div className="text-xs font-mono text-zinc-400">{user.chat_id || user.id}</div>
                        <div className="text-xs text-zinc-400">{user.platform || "telegram"}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-medium dark:text-white">{user.first_name || "—"}</div>
                        <div className="text-xs text-zinc-400">@{user.username || "—"}</div>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${PLAN_COLORS[user.plan]}`}>
                          {user.plan}
                        </span>
                        {user.is_banned && <div className="text-xs text-red-500 mt-1">⛔ Banned</div>}
                      </td>
                      <td className="p-3">{formatExpiry(user.premium_until)}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-zinc-200 dark:bg-zinc-700 rounded-full h-1.5">
                            <div
                              className="bg-orange-400 h-1.5 rounded-full"
                              style={{ width: `${getQuotaProgressPercent(user.daily_ai_usage_count)}%` }}
                            />
                          </div>
                          <span className="text-xs text-zinc-500">{user.daily_ai_usage_count || 0}</span>
                        </div>
                      </td>
                      <td className="p-3 text-xs text-zinc-400">
                        {user.last_active ? new Date(user.last_active).toLocaleDateString("vi-VN") : "—"}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={loading || !schema?.ready}
                            className="text-xs h-7 px-2"
                            onClick={() => handleAddDays(user.id, 7, "weekly")}
                          >
                            +7d
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={loading || !schema?.ready}
                            className="text-xs h-7 px-2"
                            onClick={() => handleAddDays(user.id, 30, "monthly")}
                          >
                            +30d
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={loading || !schema?.ready}
                            className="text-xs h-7 px-2 text-red-500 border-red-300"
                            onClick={() => handleRemoveDays(user.id, 7)}
                          >
                            -7d
                          </Button>
                          <div className="flex gap-1">
                            <Input
                              type="number"
                              placeholder="Nd"
                              value={customDays[user.id] || ""}
                              onChange={(event) => setCustomDays((prev) => ({ ...prev, [user.id]: event.target.value }))}
                              className="h-7 text-xs w-14 px-2"
                            />
                            <Button
                              size="sm"
                              disabled={loading || !schema?.ready}
                              className="h-7 text-xs px-2 bg-emerald-500 hover:bg-emerald-600 text-white"
                              onClick={() => {
                                const days = parseInt(customDays[user.id], 10);
                                if (days > 0) handleAddDays(user.id, days, "monthly");
                              }}
                            >
                              +
                            </Button>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={loading || !schema?.ready}
                            className={`text-xs h-7 px-2 ${
                              user.is_active && !user.is_banned ? "text-orange-500 border-orange-300" : "text-green-500 border-green-300"
                            }`}
                            onClick={() => handleBan(user)}
                          >
                            {user.is_active && !user.is_banned ? "Ban" : "Unban"}
                          </Button>
                          <Button size="sm" variant="outline" className="text-xs h-7 px-2" onClick={() => openTimeline(user)}>
                            📋
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-zinc-500">Không tìm thấy users.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "payments" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-zinc-900 border dark:border-zinc-800 rounded-xl p-5 space-y-3">
              <h2 className="font-semibold dark:text-white">➕ Ghi giao dịch thủ công</h2>
              <Input
                placeholder="User ID (số)"
                value={payForm.userId}
                onChange={(event) => setPayForm((prev) => ({ ...prev, userId: event.target.value }))}
              />
              <Input
                placeholder="Số tiền (VNĐ)"
                type="number"
                value={payForm.amount}
                onChange={(event) => setPayForm((prev) => ({ ...prev, amount: event.target.value }))}
              />
              <select
                value={payForm.billingSku}
                onChange={(event) => setPayForm((prev) => ({ ...prev, billingSku: event.target.value as BillingSku }))}
                className="w-full border rounded-md px-3 py-2 text-sm dark:bg-zinc-800 dark:border-zinc-700 dark:text-white"
              >
                {SKU_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} · {option.tier}
                  </option>
                ))}
              </select>
              <Input
                placeholder="Mã giao dịch (tùy chọn)"
                value={payForm.txCode}
                onChange={(event) => setPayForm((prev) => ({ ...prev, txCode: event.target.value }))}
              />
              <Input
                placeholder="Ghi chú"
                value={payForm.note}
                onChange={(event) => setPayForm((prev) => ({ ...prev, note: event.target.value }))}
              />
              <Button
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
                disabled={loading || !schema?.ready}
                onClick={handleLogPayment}
              >
                {loading ? "Đang xử lý..." : "✅ Xác nhận & cấp gói"}
              </Button>
            </div>

            <div className="lg:col-span-2 bg-white dark:bg-zinc-900 border dark:border-zinc-800 rounded-xl shadow-sm overflow-x-auto">
              <div className="p-4 border-b dark:border-zinc-800 flex justify-between items-center">
                <h2 className="font-semibold dark:text-white">📋 Lịch sử giao dịch ({payments.length})</h2>
                <Button variant="outline" size="sm" onClick={fetchData}>🔄</Button>
              </div>
              <table className="w-full text-sm text-left">
                <thead className="bg-zinc-100 dark:bg-zinc-800 text-xs uppercase text-zinc-500">
                  <tr>
                    {["User ID", "SKU / Tier", "Số tiền", "Trạng thái", "Mã GD", "Ghi chú", "Thời gian"].map((header) => (
                      <th key={header} className="p-3 whitespace-nowrap">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id} className="border-t dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                      <td className="p-3 text-xs text-zinc-400">{payment.user_id}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 rounded-full text-xs font-bold">
                          {payment.billing_sku || payment.payment_method}
                        </span>
                        <div className="text-xs text-zinc-400">{payment.plan_granted || "—"}</div>
                      </td>
                      <td className="p-3 font-medium dark:text-white">{Number(payment.amount).toLocaleString("vi-VN")}đ</td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            payment.status === "completed"
                              ? "bg-green-100 text-green-700"
                              : payment.status === "pending"
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-red-100 text-red-700"
                          }`}
                        >
                          {payment.status}
                        </span>
                      </td>
                      <td className="p-3 text-xs font-mono text-zinc-400">{payment.transaction_code || "—"}</td>
                      <td className="p-3 text-xs text-zinc-400 max-w-[140px] truncate">{payment.description || "—"}</td>
                      <td className="p-3 text-xs text-zinc-400 whitespace-nowrap">
                        {new Date(payment.created_at).toLocaleString("vi-VN")}
                      </td>
                    </tr>
                  ))}
                  {payments.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-zinc-500">Chưa có giao dịch hoặc schema chưa apply.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {timelineUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setTimelineUser(null)}>
          <div
            className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-5 border-b dark:border-zinc-800 flex justify-between items-center">
              <div>
                <h2 className="font-bold dark:text-white text-lg">📋 Timeline: {timelineUser.first_name || timelineUser.username || `User ${timelineUser.id}`}</h2>
                <p className="text-xs text-zinc-400">ID {timelineUser.id} · {timelineUser.platform || "telegram"}</p>
              </div>
              <button onClick={() => setTimelineUser(null)} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-white text-xl">
                ✕
              </button>
            </div>
            <div className="p-5 space-y-3">
              {timelineLoading && <p className="text-zinc-500 text-sm">Đang tải...</p>}
              {!timelineLoading && timelineEvents.length === 0 && <p className="text-zinc-500 text-sm">Chưa có sự kiện nào hoặc schema chưa apply.</p>}
              {timelineEvents.map((event) => (
                <div key={event.id} className="flex gap-3 items-start">
                  <div className="w-2 h-2 rounded-full mt-2 flex-shrink-0 bg-emerald-500" />
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <span className="text-sm font-medium dark:text-white">{event.event_type.replace(/_/g, " ")}</span>
                      <span className="text-xs text-zinc-400">{new Date(event.created_at).toLocaleDateString("vi-VN")}</span>
                    </div>
                    {event.plan_from && <p className="text-xs text-zinc-400">{event.plan_from} → {event.plan_to}</p>}
                    {event.billing_sku && <p className="text-xs text-zinc-400">SKU: {event.billing_sku}</p>}
                    {event.amount > 0 && <p className="text-xs text-emerald-600 font-medium">{event.amount.toLocaleString("vi-VN")}đ · {event.source}</p>}
                    {event.notes && <p className="text-xs text-zinc-500">{event.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
