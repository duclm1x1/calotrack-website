import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  addDaysToUser,
  commitFoodCsvImport,
  describeSchemaReadiness,
  dryRunFoodCsvImport,
  exportUsersCSV,
  fetchAdminUsers,
  fetchFoodCandidates,
  fetchFoodCatalog,
  fetchPayments,
  getAdminSkuOptions,
  getQuotaProgressPercent,
  getQuotaThresholdNotice,
  getSaasSchemaReadiness,
  getSubscriptionEvents,
  getSystemStats,
  logPayment,
  promoteFoodCandidate,
  removeDaysFromUser,
  toggleUserBan,
  upsertFood,
  upsertFoodAlias,
  upsertFoodNutrition,
  upsertFoodPortion,
  type AdminUser,
  type FoodCandidateRow,
  type FoodCatalogRow,
  type FoodCsvDryRunResult,
  type FoodCsvRow,
  type PaymentRow,
  type SchemaReadiness,
  type SubscriptionEvent,
  type SystemStats,
} from "@/lib/adminApi";
import { getFreeDailyLimit, type BillingSku } from "@/lib/billing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Tab = "overview" | "users" | "payments" | "catalog";

type FoodFormState = {
  id: number | null;
  name: string;
  category: string;
  foodType: string;
  brandName: string;
  defaultServingGrams: string;
  defaultPortionLabel: string;
  primarySourceType: string;
  primarySourceConfidence: string;
  editorNotes: string;
  isActive: boolean;
};

type NutritionFormState = {
  servingLabel: string;
  servingGrams: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
  sourceType: string;
  sourceRef: string;
  confidence: string;
};

type PortionFormState = {
  label: string;
  grams: string;
  quantityValue: string;
  quantityUnit: string;
  portionType: string;
  sourceType: string;
  confidence: string;
  isDefault: boolean;
};

type PromoteCandidateFormState = {
  candidateId: number | null;
  name: string;
  category: string;
  foodType: string;
  brandName: string;
  servingLabel: string;
  servingGrams: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  aliases: string;
};

const PLAN_COLORS: Record<AdminUser["plan"], string> = {
  free: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  pro: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  lifetime: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
};

const FOOD_TYPE_OPTIONS = [
  "generic",
  "meal",
  "protein",
  "carb",
  "fat",
  "vegetable",
  "fruit",
  "beverage",
  "snack",
];

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

function asNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values.map((value) => value.replace(/^"|"$/g, "").trim());
}

function parseFoodCsvText(rawText: string): FoodCsvRow[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());

  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    return {
      food_name: row.food_name || "",
      alias_list: row.alias_list || "",
      brand_name: row.brand_name || "",
      category: row.category || "",
      serving_label: row.serving_label || "",
      serving_grams: row.serving_grams || "",
      calories: row.calories || "",
      protein: row.protein || "",
      carbs: row.carbs || "",
      fat: row.fat || "",
      source_type: row.source_type || "manual_csv",
      confidence: row.confidence || "1",
    };
  });
}

function toFoodForm(food?: FoodCatalogRow | null): FoodFormState {
  return {
    id: food?.id ?? null,
    name: food?.name ?? "",
    category: food?.category ?? "",
    foodType: food?.food_type ?? "generic",
    brandName: food?.brand_name ?? "",
    defaultServingGrams: food?.default_serving_grams?.toString() ?? "",
    defaultPortionLabel: food?.default_portion_label ?? "",
    primarySourceType: food?.primary_source_type ?? "manual",
    primarySourceConfidence: food?.primary_source_confidence?.toString() ?? "1",
    editorNotes: "",
    isActive: food?.is_active ?? true,
  };
}

function defaultNutritionForm(food?: FoodCatalogRow | null): NutritionFormState {
  return {
    servingLabel: food?.default_portion_label ?? "100g",
    servingGrams: food?.default_serving_grams?.toString() ?? "100",
    calories: food?.calories?.toString() ?? "",
    protein: food?.protein?.toString() ?? "",
    carbs: food?.carbs?.toString() ?? "",
    fat: food?.fat?.toString() ?? "",
    fiber: "",
    sourceType: food?.primary_source_type ?? "manual",
    sourceRef: "",
    confidence: food?.primary_source_confidence?.toString() ?? "1",
  };
}

function defaultPortionForm(food?: FoodCatalogRow | null): PortionFormState {
  return {
    label: food?.default_portion_label ?? "",
    grams: food?.default_serving_grams?.toString() ?? "",
    quantityValue: "1",
    quantityUnit: "",
    portionType: "serving",
    sourceType: "manual",
    confidence: "1",
    isDefault: true,
  };
}

function defaultPromoteCandidateForm(candidate?: FoodCandidateRow | null): PromoteCandidateFormState {
  return {
    candidateId: candidate?.id ?? null,
    name: candidate?.suggested_food_name ?? candidate?.raw_name ?? "",
    category: "",
    foodType: "generic",
    brandName: "",
    servingLabel: candidate?.suggested_serving_label ?? "100g",
    servingGrams: "100",
    calories: "",
    protein: "",
    carbs: "",
    fat: "",
    aliases: candidate?.raw_name ?? "",
  };
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

  const [catalogSearch, setCatalogSearch] = useState("");
  const [candidateStatus, setCandidateStatus] = useState("pending");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [foods, setFoods] = useState<FoodCatalogRow[]>([]);
  const [candidates, setCandidates] = useState<FoodCandidateRow[]>([]);
  const [selectedFoodId, setSelectedFoodId] = useState<number | null>(null);
  const [foodForm, setFoodForm] = useState<FoodFormState>(toFoodForm(null));
  const [aliasInput, setAliasInput] = useState("");
  const [nutritionForm, setNutritionForm] = useState<NutritionFormState>(defaultNutritionForm(null));
  const [portionForm, setPortionForm] = useState<PortionFormState>(defaultPortionForm(null));
  const [promoteForm, setPromoteForm] = useState<PromoteCandidateFormState>(defaultPromoteCandidateForm(null));
  const [csvText, setCsvText] = useState("");
  const [csvFileName, setCsvFileName] = useState("");
  const [csvDryRun, setCsvDryRun] = useState<FoodCsvDryRunResult | null>(null);

  const fetchBaseData = useCallback(async () => {
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

  const fetchCatalogData = useCallback(async () => {
    try {
      setCatalogLoading(true);
      const [nextFoods, nextCandidates] = await Promise.all([
        fetchFoodCatalog(catalogSearch),
        fetchFoodCandidates(candidateStatus === "all" ? "" : candidateStatus),
      ]);
      setFoods(nextFoods);
      setCandidates(nextCandidates);
    } catch (error) {
      toast.error(`Không tải được catalog foods: ${String((error as Error)?.message || error)}`);
    } finally {
      setCatalogLoading(false);
    }
  }, [catalogSearch, candidateStatus]);

  useEffect(() => {
    fetchBaseData();
  }, [fetchBaseData]);

  useEffect(() => {
    if (tab === "catalog") {
      fetchCatalogData();
    }
  }, [tab, fetchCatalogData]);

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

  const selectedFood = useMemo(
    () => foods.find((food) => food.id === selectedFoodId) ?? null,
    [foods, selectedFoodId],
  );

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

  const withRefresh = async (fn: () => Promise<void>, successMessage: string, options?: { refreshCatalog?: boolean }) => {
    try {
      setLoading(true);
      await fn();
      toast.success(successMessage);
      await fetchBaseData();
      if (options?.refreshCatalog) {
        await fetchCatalogData();
      }
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

  const handleSelectFood = (food: FoodCatalogRow) => {
    setSelectedFoodId(food.id);
    setFoodForm(toFoodForm(food));
    setNutritionForm(defaultNutritionForm(food));
    setPortionForm(defaultPortionForm(food));
    setAliasInput("");
  };

  const resetFoodForms = () => {
    setSelectedFoodId(null);
    setFoodForm(toFoodForm(null));
    setNutritionForm(defaultNutritionForm(null));
    setPortionForm(defaultPortionForm(null));
    setAliasInput("");
  };

  const handleSaveFood = async () => {
    if (!foodForm.name.trim()) {
      toast.error("Tên món là bắt buộc");
      return;
    }

    await withRefresh(async () => {
      const foodId = await upsertFood({
        id: foodForm.id,
        name: foodForm.name.trim(),
        category: foodForm.category.trim() || null,
        foodType: foodForm.foodType || null,
        brandName: foodForm.brandName.trim() || null,
        defaultServingGrams: asNumberOrNull(foodForm.defaultServingGrams),
        defaultPortionLabel: foodForm.defaultPortionLabel.trim() || null,
        primarySourceType: foodForm.primarySourceType.trim() || "manual",
        primarySourceConfidence: asNumberOrNull(foodForm.primarySourceConfidence) ?? 1,
        editorNotes: foodForm.editorNotes.trim() || null,
        isActive: foodForm.isActive,
      });
      setSelectedFoodId(foodId);
    }, "Đã lưu food catalog", { refreshCatalog: true });
  };

  const handleAddAlias = async () => {
    if (!selectedFoodId) {
      toast.error("Chọn food trước khi thêm alias");
      return;
    }
    if (!aliasInput.trim()) {
      toast.error("Alias không được để trống");
      return;
    }

    await withRefresh(async () => {
      await upsertFoodAlias({
        foodId: selectedFoodId,
        alias: aliasInput.trim(),
        aliasType: "common_name",
        isPrimary: false,
        sourceType: "manual",
        confidence: 1,
      });
      setAliasInput("");
    }, "Đã thêm alias", { refreshCatalog: true });
  };

  const handleSaveNutrition = async () => {
    if (!selectedFoodId) {
      toast.error("Chọn food trước khi lưu nutrition");
      return;
    }
    await withRefresh(async () => {
      await upsertFoodNutrition({
        foodId: selectedFoodId,
        servingLabel: nutritionForm.servingLabel.trim() || "100g",
        servingGrams: asNumberOrNull(nutritionForm.servingGrams) ?? 100,
        calories: asNumberOrNull(nutritionForm.calories) ?? 0,
        protein: asNumberOrNull(nutritionForm.protein) ?? 0,
        carbs: asNumberOrNull(nutritionForm.carbs) ?? 0,
        fat: asNumberOrNull(nutritionForm.fat) ?? 0,
        fiber: asNumberOrNull(nutritionForm.fiber),
        sourceType: nutritionForm.sourceType.trim() || "manual",
        sourceRef: nutritionForm.sourceRef.trim() || null,
        confidence: asNumberOrNull(nutritionForm.confidence) ?? 1,
        isPrimary: true,
      });
    }, "Đã lưu nutrition", { refreshCatalog: true });
  };

  const handleSavePortion = async () => {
    if (!selectedFoodId) {
      toast.error("Chọn food trước khi lưu portion");
      return;
    }
    if (!portionForm.label.trim() || !portionForm.grams.trim()) {
      toast.error("Label và gram là bắt buộc");
      return;
    }

    await withRefresh(async () => {
      await upsertFoodPortion({
        foodId: selectedFoodId,
        label: portionForm.label.trim(),
        grams: asNumberOrNull(portionForm.grams) ?? 0,
        quantityValue: asNumberOrNull(portionForm.quantityValue) ?? 1,
        quantityUnit: portionForm.quantityUnit.trim() || null,
        portionType: portionForm.portionType.trim() || "serving",
        sourceType: portionForm.sourceType.trim() || "manual",
        confidence: asNumberOrNull(portionForm.confidence) ?? 1,
        isDefault: portionForm.isDefault,
      });
    }, "Đã lưu portion", { refreshCatalog: true });
  };

  const loadCandidateIntoForm = (candidate: FoodCandidateRow) => {
    setPromoteForm(defaultPromoteCandidateForm(candidate));
    setFoodForm((prev) => ({
      ...prev,
      id: null,
      name: candidate.suggested_food_name ?? candidate.raw_name,
      defaultPortionLabel: candidate.suggested_serving_label ?? prev.defaultPortionLabel,
    }));
    setTab("catalog");
  };

  const handlePromoteCandidate = async () => {
    if (!promoteForm.candidateId) {
      toast.error("Chọn candidate trước khi promote");
      return;
    }
    if (!promoteForm.name.trim()) {
      toast.error("Tên món promote là bắt buộc");
      return;
    }

    await withRefresh(async () => {
      const foodId = await promoteFoodCandidate({
        candidateId: promoteForm.candidateId,
        name: promoteForm.name.trim(),
        category: promoteForm.category.trim() || null,
        foodType: promoteForm.foodType.trim() || null,
        brandName: promoteForm.brandName.trim() || null,
        servingLabel: promoteForm.servingLabel.trim() || "100g",
        servingGrams: asNumberOrNull(promoteForm.servingGrams) ?? 100,
        calories: asNumberOrNull(promoteForm.calories) ?? 0,
        protein: asNumberOrNull(promoteForm.protein) ?? 0,
        carbs: asNumberOrNull(promoteForm.carbs) ?? 0,
        fat: asNumberOrNull(promoteForm.fat) ?? 0,
        aliases: promoteForm.aliases
          .split(",")
          .map((alias) => alias.trim())
          .filter(Boolean),
      });
      setSelectedFoodId(foodId);
    }, "Đã promote candidate thành food", { refreshCatalog: true });
  };

  const handleQuickPromoteCandidate = async (candidate: FoodCandidateRow) => {
    await withRefresh(async () => {
      const foodId = await promoteFoodCandidate({
        candidateId: candidate.id,
        name: candidate.suggested_food_name ?? candidate.raw_name,
        servingLabel: candidate.suggested_serving_label ?? "100g",
        servingGrams: 100,
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        aliases: [candidate.raw_name].filter(Boolean),
      });
      setSelectedFoodId(foodId);
    }, "Đã promote candidate nhanh", { refreshCatalog: true });
  };

  const handleCsvFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const text = await file.text();
    setCsvText(text);
  };

  const handleCsvDryRun = async () => {
    const rows = parseFoodCsvText(csvText);
    if (rows.length === 0) {
      toast.error("CSV cần có header và ít nhất 1 dòng dữ liệu");
      return;
    }
    try {
      setCatalogLoading(true);
      const result = await dryRunFoodCsvImport(rows);
      setCsvDryRun(result);
      toast.success(`Dry-run xong: ${result.newCount} mới, ${result.duplicateCount} trùng`);
    } catch (error) {
      toast.error(`Dry-run CSV thất bại: ${String((error as Error)?.message || error)}`);
    } finally {
      setCatalogLoading(false);
    }
  };

  const handleCsvCommit = async () => {
    const rows = parseFoodCsvText(csvText);
    if (rows.length === 0) {
      toast.error("CSV cần có dữ liệu hợp lệ trước khi commit");
      return;
    }
    await withRefresh(async () => {
      const result = await commitFoodCsvImport(rows);
      toast.success(`Đã import ${result.insertedCount} món mới, cập nhật ${result.updatedCount} món`);
      setCsvDryRun(null);
    }, "CSV import đã được commit", { refreshCatalog: true });
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "📊 Tổng quan" },
    { key: "users", label: "👥 Users" },
    { key: "payments", label: "💳 Giao dịch" },
    { key: "catalog", label: "🍱 Catalog foods" },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div>
          <h1 className="text-2xl font-bold dark:text-white">CaloTrack Admin</h1>
          <p className="text-xs text-zinc-500">Telegram-first SaaS operator console</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                tab === item.key
                  ? "bg-emerald-500 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            schema?.ready
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
              : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
          }`}
        >
          {describeSchemaReadiness(schema)}
        </div>

        {tab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                { label: "Tổng users", value: stats?.totalUsers ?? users.length, color: "text-blue-500" },
                { label: "Pro users", value: stats?.premiumUsers ?? users.filter((user) => user.plan === "pro").length, color: "text-emerald-500" },
                { label: "Lifetime", value: stats?.lifetimeUsers ?? users.filter((user) => user.plan === "lifetime").length, color: "text-amber-500" },
                { label: "AI calls hôm nay", value: stats?.todayAICalls ?? 0, color: "text-purple-500" },
                { label: "Doanh thu tháng", value: `${(stats?.monthRevenue ?? 0).toLocaleString("vi-VN")}đ`, color: "text-green-500" },
                { label: "Doanh thu tổng", value: `${(stats?.totalRevenue ?? 0).toLocaleString("vi-VN")}đ`, color: "text-yellow-500" },
                { label: "Sắp hết hạn", value: stats?.expiringIn7Days ?? expiringSoon.length, color: "text-orange-500" },
                { label: "Free users", value: users.filter((user) => user.plan === "free").length, color: "text-zinc-400" },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                  <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
                  <div className="mt-1 text-xs text-zinc-500">{item.label}</div>
                </div>
              ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="rounded-xl border bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <h3 className="mb-4 font-semibold dark:text-white">Sắp hết hạn trong 7 ngày</h3>
                <div className="space-y-2">
                  {expiringSoon.slice(0, 5).map((user) => (
                    <div key={user.id} className="flex items-center justify-between border-b py-2 dark:border-zinc-800">
                      <span className="text-sm dark:text-white">{user.first_name || user.username || `User ${user.id}`}</span>
                      <span className="text-xs text-orange-500">{new Date(user.premium_until as string).toLocaleDateString("vi-VN")}</span>
                    </div>
                  ))}
                  {expiringSoon.length === 0 && <p className="text-sm text-zinc-500">Chưa có user nào sắp hết hạn.</p>}
                </div>
              </div>

              <div className="rounded-xl border bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <h3 className="mb-4 font-semibold dark:text-white">Pending / failed payments</h3>
                <div className="space-y-2">
                  {pendingPayments.map((payment) => (
                    <div key={payment.id} className="border-b py-2 dark:border-zinc-800">
                      <div className="text-sm dark:text-white">User {payment.user_id} · {payment.billing_sku || payment.plan_granted || payment.payment_method}</div>
                      <div className="text-xs text-zinc-500">
                        {payment.status} · {Number(payment.amount).toLocaleString("vi-VN")}đ
                      </div>
                    </div>
                  ))}
                  {pendingPayments.length === 0 && <p className="text-sm text-zinc-500">Không có giao dịch pending/failed.</p>}
                </div>
              </div>

              <div className="rounded-xl border bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <h3 className="mb-4 font-semibold dark:text-white">Quota anomalies</h3>
                <div className="space-y-2">
                  {quotaHotspots.map((user) => (
                    <div key={user.id} className="border-b py-2 dark:border-zinc-800">
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
            <div className="flex flex-wrap items-center gap-3">
              <Input
                placeholder="Tìm username, chat_id, platform_id..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="max-w-xs"
              />
              <select
                value={planFilter}
                onChange={(event) => setPlanFilter(event.target.value as "all" | AdminUser["plan"])}
                className="rounded-md border px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              >
                <option value="all">Tất cả plans</option>
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="lifetime">Lifetime</option>
              </select>
              <Button variant="outline" onClick={fetchBaseData} size="sm">Refresh</Button>
              <Button variant="outline" size="sm" onClick={() => exportUsersCSV(filteredUsers as unknown as Record<string, unknown>[])}>CSV</Button>
              <span className="text-sm text-zinc-500">{filteredUsers.length} users</span>
            </div>

            <div className="overflow-x-auto rounded-xl border bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-100 text-xs uppercase text-zinc-500 dark:bg-zinc-800">
                  <tr>
                    {["ID / Platform", "Tên", "Gói", "Hết hạn", "AI hôm nay", "Hoạt động", "Actions"].map((header) => (
                      <th key={header} className="whitespace-nowrap p-3">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      className={`border-t hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50 ${
                        !user.is_active || user.is_banned ? "opacity-50" : ""
                      }`}
                    >
                      <td className="p-3">
                        <div className="font-mono text-xs text-zinc-400">{user.chat_id || user.id}</div>
                        <div className="text-xs text-zinc-400">{user.platform || "telegram"}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-medium dark:text-white">{user.first_name || "—"}</div>
                        <div className="text-xs text-zinc-400">@{user.username || "—"}</div>
                      </td>
                      <td className="p-3">
                        <span className={`rounded-full px-2 py-1 text-xs font-bold ${PLAN_COLORS[user.plan]}`}>{user.plan}</span>
                        {user.is_banned && <div className="mt-1 text-xs text-red-500">Banned</div>}
                      </td>
                      <td className="p-3">{formatExpiry(user.premium_until)}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 rounded-full bg-zinc-200 dark:bg-zinc-700">
                            <div
                              className="h-1.5 rounded-full bg-orange-400"
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
                          <Button size="sm" variant="outline" disabled={loading || !schema?.ready} className="h-7 px-2 text-xs" onClick={() => handleAddDays(user.id, 7, "weekly")}>+7d</Button>
                          <Button size="sm" variant="outline" disabled={loading || !schema?.ready} className="h-7 px-2 text-xs" onClick={() => handleAddDays(user.id, 30, "monthly")}>+30d</Button>
                          <Button size="sm" variant="outline" disabled={loading || !schema?.ready} className="h-7 border-red-300 px-2 text-xs text-red-500" onClick={() => handleRemoveDays(user.id, 7)}>-7d</Button>
                          <div className="flex gap-1">
                            <Input
                              type="number"
                              placeholder="Nd"
                              value={customDays[user.id] || ""}
                              onChange={(event) => setCustomDays((prev) => ({ ...prev, [user.id]: event.target.value }))}
                              className="h-7 w-14 px-2 text-xs"
                            />
                            <Button
                              size="sm"
                              disabled={loading || !schema?.ready}
                              className="h-7 bg-emerald-500 px-2 text-xs text-white hover:bg-emerald-600"
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
                            className={`h-7 px-2 text-xs ${
                              user.is_active && !user.is_banned ? "border-orange-300 text-orange-500" : "border-green-300 text-green-500"
                            }`}
                            onClick={() => handleBan(user)}
                          >
                            {user.is_active && !user.is_banned ? "Ban" : "Unban"}
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => openTimeline(user)}>Timeline</Button>
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
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-3 rounded-xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="font-semibold dark:text-white">Ghi giao dịch thủ công</h2>
              <Input placeholder="User ID (số)" value={payForm.userId} onChange={(event) => setPayForm((prev) => ({ ...prev, userId: event.target.value }))} />
              <Input placeholder="Số tiền (VNĐ)" type="number" value={payForm.amount} onChange={(event) => setPayForm((prev) => ({ ...prev, amount: event.target.value }))} />
              <select
                value={payForm.billingSku}
                onChange={(event) => setPayForm((prev) => ({ ...prev, billingSku: event.target.value as BillingSku }))}
                className="w-full rounded-md border px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              >
                {SKU_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} · {option.tier}
                  </option>
                ))}
              </select>
              <Input placeholder="Mã giao dịch (tùy chọn)" value={payForm.txCode} onChange={(event) => setPayForm((prev) => ({ ...prev, txCode: event.target.value }))} />
              <Input placeholder="Ghi chú" value={payForm.note} onChange={(event) => setPayForm((prev) => ({ ...prev, note: event.target.value }))} />
              <Button className="w-full bg-emerald-500 text-white hover:bg-emerald-600" disabled={loading || !schema?.ready} onClick={handleLogPayment}>
                {loading ? "Đang xử lý..." : "Xác nhận & cấp gói"}
              </Button>
            </div>

            <div className="overflow-x-auto rounded-xl border bg-white shadow-sm lg:col-span-2 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center justify-between border-b p-4 dark:border-zinc-800">
                <h2 className="font-semibold dark:text-white">Lịch sử giao dịch ({payments.length})</h2>
                <Button variant="outline" size="sm" onClick={fetchBaseData}>Refresh</Button>
              </div>
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-100 text-xs uppercase text-zinc-500 dark:bg-zinc-800">
                  <tr>
                    {["User ID", "SKU / Tier", "Số tiền", "Trạng thái", "Mã GD", "Ghi chú", "Thời gian"].map((header) => (
                      <th key={header} className="whitespace-nowrap p-3">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id} className="border-t hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50">
                      <td className="p-3 text-xs text-zinc-400">{payment.user_id}</td>
                      <td className="p-3">
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                          {payment.billing_sku || payment.payment_method}
                        </span>
                        <div className="text-xs text-zinc-400">{payment.plan_granted || "—"}</div>
                      </td>
                      <td className="p-3 font-medium dark:text-white">{Number(payment.amount).toLocaleString("vi-VN")}đ</td>
                      <td className="p-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
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
                      <td className="p-3 font-mono text-xs text-zinc-400">{payment.transaction_code || "—"}</td>
                      <td className="max-w-[160px] truncate p-3 text-xs text-zinc-400">{payment.description || "—"}</td>
                      <td className="whitespace-nowrap p-3 text-xs text-zinc-400">{new Date(payment.created_at).toLocaleString("vi-VN")}</td>
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

        {tab === "catalog" && (
          <div className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
              <div className="space-y-4 rounded-xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex flex-wrap items-center gap-3">
                  <Input
                    placeholder="Tìm food theo tên, brand hoặc alias..."
                    value={catalogSearch}
                    onChange={(event) => setCatalogSearch(event.target.value)}
                    className="max-w-md"
                  />
                  <Button variant="outline" size="sm" onClick={fetchCatalogData} disabled={catalogLoading}>Refresh</Button>
                  <Button variant="outline" size="sm" onClick={resetFoodForms}>Food mới</Button>
                  <span className="text-sm text-zinc-500">{foods.length} foods</span>
                </div>

                <div className="overflow-x-auto rounded-xl border dark:border-zinc-800">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-100 text-xs uppercase text-zinc-500 dark:bg-zinc-800">
                      <tr>
                        {["Food", "Type", "Serving", "Macros", "Source", "Aliases"].map((header) => (
                          <th key={header} className="whitespace-nowrap p-3">{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {foods.map((food) => (
                        <tr
                          key={food.id}
                          className={`cursor-pointer border-t hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50 ${
                            selectedFoodId === food.id ? "bg-emerald-50 dark:bg-emerald-950/20" : ""
                          }`}
                          onClick={() => handleSelectFood(food)}
                        >
                          <td className="p-3">
                            <div className="font-medium dark:text-white">{food.name}</div>
                            <div className="text-xs text-zinc-400">{food.brand_name || food.category || "—"}</div>
                          </td>
                          <td className="p-3 text-xs text-zinc-500">{food.food_type || "generic"}</td>
                          <td className="p-3 text-xs text-zinc-500">
                            {food.default_serving_grams ?? "—"}g · {food.default_portion_label || "—"}
                          </td>
                          <td className="p-3 text-xs text-zinc-500">
                            {food.calories ?? 0} kcal · P {food.protein ?? 0} · C {food.carbs ?? 0} · F {food.fat ?? 0}
                          </td>
                          <td className="p-3 text-xs text-zinc-500">{food.primary_source_type || "—"}</td>
                          <td className="p-3 text-xs text-zinc-500">{food.alias_count}</td>
                        </tr>
                      ))}
                      {foods.length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-zinc-500">Chưa có food nào hoặc migration chưa apply.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-3 rounded-xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-semibold dark:text-white">{selectedFood ? `Chỉnh food #${selectedFood.id}` : "Tạo food mới"}</h2>
                    {selectedFood && <Button variant="outline" size="sm" onClick={resetFoodForms}>Bỏ chọn</Button>}
                  </div>
                  <Input placeholder="Tên món" value={foodForm.name} onChange={(event) => setFoodForm((prev) => ({ ...prev, name: event.target.value }))} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input placeholder="Category" value={foodForm.category} onChange={(event) => setFoodForm((prev) => ({ ...prev, category: event.target.value }))} />
                    <select
                      value={foodForm.foodType}
                      onChange={(event) => setFoodForm((prev) => ({ ...prev, foodType: event.target.value }))}
                      className="rounded-md border px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                    >
                      {FOOD_TYPE_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input placeholder="Brand name" value={foodForm.brandName} onChange={(event) => setFoodForm((prev) => ({ ...prev, brandName: event.target.value }))} />
                    <Input placeholder="Default portion label" value={foodForm.defaultPortionLabel} onChange={(event) => setFoodForm((prev) => ({ ...prev, defaultPortionLabel: event.target.value }))} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Input placeholder="Default serving grams" type="number" value={foodForm.defaultServingGrams} onChange={(event) => setFoodForm((prev) => ({ ...prev, defaultServingGrams: event.target.value }))} />
                    <Input placeholder="Source type" value={foodForm.primarySourceType} onChange={(event) => setFoodForm((prev) => ({ ...prev, primarySourceType: event.target.value }))} />
                    <Input placeholder="Confidence" type="number" step="0.01" value={foodForm.primarySourceConfidence} onChange={(event) => setFoodForm((prev) => ({ ...prev, primarySourceConfidence: event.target.value }))} />
                  </div>
                  <textarea
                    value={foodForm.editorNotes}
                    onChange={(event) => setFoodForm((prev) => ({ ...prev, editorNotes: event.target.value }))}
                    placeholder="Editor notes"
                    className="min-h-24 w-full rounded-md border px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  />
                  <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                    <input
                      type="checkbox"
                      checked={foodForm.isActive}
                      onChange={(event) => setFoodForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                    />
                    Food đang active
                  </label>
                  <Button className="w-full bg-emerald-500 text-white hover:bg-emerald-600" disabled={loading || !schema?.ready} onClick={handleSaveFood}>
                    Lưu food
                  </Button>
                </div>

                <div className="space-y-3 rounded-xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                  <h2 className="font-semibold dark:text-white">Alias / Nutrition / Portion</h2>
                  <div className="rounded-lg bg-zinc-50 p-3 text-xs text-zinc-500 dark:bg-zinc-800/50">
                    {selectedFood ? `Đang chỉnh cho: ${selectedFood.name}` : "Chọn food ở bảng bên trái để thêm alias, nutrition và portion."}
                  </div>

                  <div className="space-y-2 border-t pt-3 dark:border-zinc-800">
                    <div className="flex gap-2">
                      <Input placeholder="Alias mới cho món này" value={aliasInput} onChange={(event) => setAliasInput(event.target.value)} />
                      <Button variant="outline" disabled={loading || !schema?.ready} onClick={handleAddAlias}>Thêm alias</Button>
                    </div>
                  </div>

                  <div className="grid gap-3 border-t pt-3 dark:border-zinc-800 sm:grid-cols-2">
                    <Input placeholder="Nutrition serving label" value={nutritionForm.servingLabel} onChange={(event) => setNutritionForm((prev) => ({ ...prev, servingLabel: event.target.value }))} />
                    <Input placeholder="Serving grams" type="number" value={nutritionForm.servingGrams} onChange={(event) => setNutritionForm((prev) => ({ ...prev, servingGrams: event.target.value }))} />
                    <Input placeholder="Calories" type="number" value={nutritionForm.calories} onChange={(event) => setNutritionForm((prev) => ({ ...prev, calories: event.target.value }))} />
                    <Input placeholder="Protein" type="number" value={nutritionForm.protein} onChange={(event) => setNutritionForm((prev) => ({ ...prev, protein: event.target.value }))} />
                    <Input placeholder="Carbs" type="number" value={nutritionForm.carbs} onChange={(event) => setNutritionForm((prev) => ({ ...prev, carbs: event.target.value }))} />
                    <Input placeholder="Fat" type="number" value={nutritionForm.fat} onChange={(event) => setNutritionForm((prev) => ({ ...prev, fat: event.target.value }))} />
                    <Input placeholder="Fiber" type="number" value={nutritionForm.fiber} onChange={(event) => setNutritionForm((prev) => ({ ...prev, fiber: event.target.value }))} />
                    <Input placeholder="Nutrition source type" value={nutritionForm.sourceType} onChange={(event) => setNutritionForm((prev) => ({ ...prev, sourceType: event.target.value }))} />
                    <Input placeholder="Source ref" value={nutritionForm.sourceRef} onChange={(event) => setNutritionForm((prev) => ({ ...prev, sourceRef: event.target.value }))} />
                    <Input placeholder="Confidence" type="number" value={nutritionForm.confidence} onChange={(event) => setNutritionForm((prev) => ({ ...prev, confidence: event.target.value }))} />
                  </div>
                  <Button variant="outline" disabled={loading || !schema?.ready} onClick={handleSaveNutrition}>Lưu nutrition</Button>

                  <div className="grid gap-3 border-t pt-3 dark:border-zinc-800 sm:grid-cols-2">
                    <Input placeholder="Portion label (vd: 1 lon 250ml)" value={portionForm.label} onChange={(event) => setPortionForm((prev) => ({ ...prev, label: event.target.value }))} />
                    <Input placeholder="Grams" type="number" value={portionForm.grams} onChange={(event) => setPortionForm((prev) => ({ ...prev, grams: event.target.value }))} />
                    <Input placeholder="Quantity value" type="number" value={portionForm.quantityValue} onChange={(event) => setPortionForm((prev) => ({ ...prev, quantityValue: event.target.value }))} />
                    <Input placeholder="Quantity unit" value={portionForm.quantityUnit} onChange={(event) => setPortionForm((prev) => ({ ...prev, quantityUnit: event.target.value }))} />
                    <Input placeholder="Portion type" value={portionForm.portionType} onChange={(event) => setPortionForm((prev) => ({ ...prev, portionType: event.target.value }))} />
                    <Input placeholder="Source type" value={portionForm.sourceType} onChange={(event) => setPortionForm((prev) => ({ ...prev, sourceType: event.target.value }))} />
                    <Input placeholder="Confidence" type="number" value={portionForm.confidence} onChange={(event) => setPortionForm((prev) => ({ ...prev, confidence: event.target.value }))} />
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm dark:border-zinc-700 dark:text-white">
                      <input type="checkbox" checked={portionForm.isDefault} onChange={(event) => setPortionForm((prev) => ({ ...prev, isDefault: event.target.checked }))} />
                      Portion mặc định
                    </label>
                  </div>
                  <Button variant="outline" disabled={loading || !schema?.ready} onClick={handleSavePortion}>Lưu portion</Button>
                </div>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
              <div className="space-y-4 rounded-xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="font-semibold dark:text-white">Food candidates</h2>
                  <select
                    value={candidateStatus}
                    onChange={(event) => setCandidateStatus(event.target.value)}
                    className="rounded-md border px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  >
                    <option value="pending">pending</option>
                    <option value="promoted">promoted</option>
                    <option value="all">all</option>
                  </select>
                  <Button variant="outline" size="sm" onClick={fetchCatalogData} disabled={catalogLoading}>Refresh</Button>
                </div>

                <div className="space-y-3">
                  {candidates.map((candidate) => (
                    <div key={candidate.id} className="rounded-lg border p-3 dark:border-zinc-800">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-medium dark:text-white">{candidate.suggested_food_name || candidate.raw_name}</div>
                          <div className="text-xs text-zinc-500">
                            {candidate.raw_name} · {candidate.raw_portion || "—"} · usage {candidate.usage_count}
                          </div>
                        </div>
                        <div className="text-xs text-zinc-500">{candidate.promotion_status || candidate.status || "pending"}</div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => loadCandidateIntoForm(candidate)}>Nạp vào form</Button>
                        <Button
                          size="sm"
                          className="bg-emerald-500 text-white hover:bg-emerald-600"
                          disabled={loading || !schema?.ready}
                          onClick={() => handleQuickPromoteCandidate(candidate)}
                        >
                          Promote nhanh
                        </Button>
                      </div>
                    </div>
                  ))}
                  {candidates.length === 0 && <p className="text-sm text-zinc-500">Chưa có candidate nào.</p>}
                </div>

                <div className="space-y-3 border-t pt-4 dark:border-zinc-800">
                  <h3 className="font-medium dark:text-white">Promote candidate có chỉnh tay</h3>
                  <Input placeholder="Candidate ID" type="number" value={promoteForm.candidateId ?? ""} onChange={(event) => setPromoteForm((prev) => ({ ...prev, candidateId: asNumberOrNull(event.target.value) }))} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input placeholder="Tên món" value={promoteForm.name} onChange={(event) => setPromoteForm((prev) => ({ ...prev, name: event.target.value }))} />
                    <Input placeholder="Category" value={promoteForm.category} onChange={(event) => setPromoteForm((prev) => ({ ...prev, category: event.target.value }))} />
                    <select value={promoteForm.foodType} onChange={(event) => setPromoteForm((prev) => ({ ...prev, foodType: event.target.value }))} className="rounded-md border px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white">
                      {FOOD_TYPE_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                    <Input placeholder="Brand" value={promoteForm.brandName} onChange={(event) => setPromoteForm((prev) => ({ ...prev, brandName: event.target.value }))} />
                    <Input placeholder="Serving label" value={promoteForm.servingLabel} onChange={(event) => setPromoteForm((prev) => ({ ...prev, servingLabel: event.target.value }))} />
                    <Input placeholder="Serving grams" type="number" value={promoteForm.servingGrams} onChange={(event) => setPromoteForm((prev) => ({ ...prev, servingGrams: event.target.value }))} />
                    <Input placeholder="Calories" type="number" value={promoteForm.calories} onChange={(event) => setPromoteForm((prev) => ({ ...prev, calories: event.target.value }))} />
                    <Input placeholder="Protein" type="number" value={promoteForm.protein} onChange={(event) => setPromoteForm((prev) => ({ ...prev, protein: event.target.value }))} />
                    <Input placeholder="Carbs" type="number" value={promoteForm.carbs} onChange={(event) => setPromoteForm((prev) => ({ ...prev, carbs: event.target.value }))} />
                    <Input placeholder="Fat" type="number" value={promoteForm.fat} onChange={(event) => setPromoteForm((prev) => ({ ...prev, fat: event.target.value }))} />
                  </div>
                  <Input placeholder="Aliases, phân tách bằng dấu phẩy" value={promoteForm.aliases} onChange={(event) => setPromoteForm((prev) => ({ ...prev, aliases: event.target.value }))} />
                  <Button className="bg-emerald-500 text-white hover:bg-emerald-600" disabled={loading || !schema?.ready} onClick={handlePromoteCandidate}>
                    Promote candidate
                  </Button>
                </div>
              </div>

              <div className="space-y-4 rounded-xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold dark:text-white">CSV import</h2>
                    <p className="text-xs text-zinc-500">Header: food_name, alias_list, brand_name, category, serving_label, serving_grams, calories, protein, carbs, fat, source_type, confidence</p>
                  </div>
                  <label className="cursor-pointer rounded-md border px-3 py-2 text-sm dark:border-zinc-700 dark:text-white">
                    Chọn file CSV
                    <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvFile} />
                  </label>
                </div>
                {csvFileName && <div className="text-xs text-zinc-500">Đang dùng file: {csvFileName}</div>}
                <textarea
                  value={csvText}
                  onChange={(event) => setCsvText(event.target.value)}
                  placeholder={`food_name,alias_list,brand_name,category,serving_label,serving_grams,calories,protein,carbs,fat,source_type,confidence\nBò húc,"bo huc,red bull",,beverage,1 lon 250ml,250,112,0,27,0,database,1`}
                  className="min-h-64 w-full rounded-md border px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled={catalogLoading || !schema?.ready} onClick={handleCsvDryRun}>Dry-run CSV</Button>
                  <Button className="bg-emerald-500 text-white hover:bg-emerald-600" disabled={loading || !schema?.ready} onClick={handleCsvCommit}>Commit CSV</Button>
                </div>
                {csvDryRun && (
                  <div className="space-y-3 rounded-xl border p-4 dark:border-zinc-800">
                    <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                      <div><div className="text-xs text-zinc-500">Rows</div><div className="font-semibold dark:text-white">{csvDryRun.totalRows}</div></div>
                      <div><div className="text-xs text-zinc-500">Valid</div><div className="font-semibold text-emerald-600">{csvDryRun.validCount}</div></div>
                      <div><div className="text-xs text-zinc-500">New</div><div className="font-semibold text-blue-600">{csvDryRun.newCount}</div></div>
                      <div><div className="text-xs text-zinc-500">Duplicate</div><div className="font-semibold text-amber-600">{csvDryRun.duplicateCount}</div></div>
                      <div><div className="text-xs text-zinc-500">Errors</div><div className="font-semibold text-red-600">{csvDryRun.errorCount}</div></div>
                    </div>
                    <div className="overflow-x-auto rounded-lg border dark:border-zinc-800">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-zinc-100 text-xs uppercase text-zinc-500 dark:bg-zinc-800">
                          <tr>
                            {["Row", "Food", "Brand", "Serving", "Status", "Existing ID"].map((header) => (
                              <th key={header} className="p-2">{header}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {csvDryRun.preview.map((item, index) => (
                            <tr key={`${item.row_number ?? index}`} className="border-t dark:border-zinc-800">
                              <td className="p-2 text-xs text-zinc-500">{String(item.row_number ?? index + 1)}</td>
                              <td className="p-2">{String(item.food_name ?? item.message ?? "—")}</td>
                              <td className="p-2 text-xs text-zinc-500">{String(item.brand_name ?? "—")}</td>
                              <td className="p-2 text-xs text-zinc-500">
                                {String(item.serving_label ?? "—")} · {String(item.serving_grams ?? "—")}
                              </td>
                              <td className="p-2 text-xs text-zinc-500">{String(item.status ?? "—")}</td>
                              <td className="p-2 text-xs text-zinc-500">{String(item.existing_food_id ?? "—")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {timelineUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setTimelineUser(null)}>
          <div
            className="mx-4 max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl dark:bg-zinc-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b p-5 dark:border-zinc-800">
              <div>
                <h2 className="text-lg font-bold dark:text-white">Timeline: {timelineUser.first_name || timelineUser.username || `User ${timelineUser.id}`}</h2>
                <p className="text-xs text-zinc-400">ID {timelineUser.id} · {timelineUser.platform || "telegram"}</p>
              </div>
              <button onClick={() => setTimelineUser(null)} className="text-xl text-zinc-400 hover:text-zinc-700 dark:hover:text-white">
                ×
              </button>
            </div>
            <div className="space-y-3 p-5">
              {timelineLoading && <p className="text-sm text-zinc-500">Đang tải...</p>}
              {!timelineLoading && timelineEvents.length === 0 && <p className="text-sm text-zinc-500">Chưa có sự kiện nào hoặc schema chưa apply.</p>}
              {timelineEvents.map((event) => (
                <div key={event.id} className="flex items-start gap-3">
                  <div className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500" />
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <span className="text-sm font-medium dark:text-white">{event.event_type.replace(/_/g, " ")}</span>
                      <span className="text-xs text-zinc-400">{new Date(event.created_at).toLocaleDateString("vi-VN")}</span>
                    </div>
                    {event.plan_from && <p className="text-xs text-zinc-400">{event.plan_from} → {event.plan_to}</p>}
                    {event.billing_sku && <p className="text-xs text-zinc-400">SKU: {event.billing_sku}</p>}
                    {event.amount > 0 && <p className="text-xs font-medium text-emerald-600">{event.amount.toLocaleString("vi-VN")}đ · {event.source}</p>}
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
