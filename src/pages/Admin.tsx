import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { AdminSectionHeader } from "@/components/admin/AdminSectionHeader";
import {
  ChannelsPanel,
  CustomerSupportPanel,
  CustomersPanel,
} from "@/components/admin/AdminCustomerPanels";
import {
  CatalogPanel,
  OverviewPanel,
  PaymentsPanel,
  SettingsPanel,
  SystemPanel,
} from "@/components/admin/AdminPanels";
import {
  AnalyticsPanel,
  EntitlementsPanel,
  SecurityPanel,
  SubscriptionsOverviewPanel,
  UsagePanel,
} from "@/components/admin/AdminSaasPanels";
import { AdminSidebar, getAdminNavItems } from "@/components/admin/AdminSidebar";
import { Button } from "@/components/ui/button";
import {
  addCustomerSupportNote,
  commitFoodCsvImport,
  dryRunFoodCsvImport,
  fetchAdminAuditLog,
  fetchAdminChannelAccounts,
  fetchAdminCustomer360,
  fetchAdminCustomers,
  fetchAdminLinkReviews,
  fetchAdminMembers,
  fetchAdminSystemHealth,
  fetchAdminUsers,
  fetchFoodCandidates,
  fetchFoodCatalog,
  fetchPayments,
  getAdminAccessState,
  getAdminSkuOptions,
  getSaasSchemaReadiness,
  getSystemStats,
  linkChannelAccount,
  linkPortalAuth,
  logPayment,
  markOrderPaid,
  mergeCustomers,
  promoteFoodCandidate,
  resetCustomerQuota,
  setAdminMemberRoles,
  setCustomerEntitlement,
  setCustomerPhone,
  toggleAdminMemberActive,
  unlinkChannelAccount,
  upsertAdminMember,
  upsertFood,
  upsertFoodAlias,
  upsertFoodNutrition,
  upsertFoodPortion,
  type AdminAccessState,
  type AdminAuditLogRow,
  type AdminChannelAccount,
  type AdminCustomer,
  type AdminCustomer360,
  type AdminLinkReview,
  type AdminMember,
  type AdminRole,
  type AdminSection,
  type AdminSystemHealth,
  type AdminUser,
  type FoodCandidateRow,
  type FoodCatalogRow,
  type FoodCsvDryRunResult,
  type FoodCsvRow,
  type PaymentRow,
  type SchemaReadiness,
  type SystemStats,
} from "@/lib/adminApi";
import {
  LIFETIME_SENTINEL_ISO,
  computePremiumUntil,
  getFreeDailyLimit,
  type BillingSku,
} from "@/lib/billing";

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

type MemberFormState = {
  linkedUserId: string;
  authUserId: string;
  displayName: string;
  roles: AdminRole[];
  isOwner: boolean;
};

type PayFormState = {
  userId: string;
  amount: string;
  billingSku: BillingSku;
  txCode: string;
  note: string;
};

type OrderReviewFormState = {
  orderCode: string;
  amount: string;
  txCode: string;
  note: string;
};

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
    defaultServingGrams: food?.default_serving_grams != null ? String(food.default_serving_grams) : "100",
    defaultPortionLabel: food?.default_portion_label ?? "100g",
    primarySourceType: food?.primary_source_type ?? "manual",
    primarySourceConfidence:
      food?.primary_source_confidence != null ? String(food.primary_source_confidence) : "1",
    editorNotes: "",
    isActive: food?.is_active ?? true,
  };
}

function defaultNutritionForm(food?: FoodCatalogRow | null): NutritionFormState {
  return {
    servingLabel: food?.default_portion_label ?? "100g",
    servingGrams: food?.default_serving_grams != null ? String(food.default_serving_grams) : "100",
    calories: food?.calories != null ? String(food.calories) : "",
    protein: food?.protein != null ? String(food.protein) : "",
    carbs: food?.carbs != null ? String(food.carbs) : "",
    fat: food?.fat != null ? String(food.fat) : "",
    fiber: "",
    sourceType: food?.primary_source_type ?? "manual",
    sourceRef: "",
    confidence: food?.primary_source_confidence != null ? String(food.primary_source_confidence) : "1",
  };
}

function defaultPortionForm(food?: FoodCatalogRow | null): PortionFormState {
  return {
    label: food?.default_portion_label ?? "100g",
    grams: food?.default_serving_grams != null ? String(food.default_serving_grams) : "100",
    quantityValue: "1",
    quantityUnit: "g",
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

function defaultMemberForm(): MemberFormState {
  return {
    linkedUserId: "",
    authUserId: "",
    displayName: "",
    roles: ["support_admin"],
    isOwner: false,
  };
}

const SKU_OPTIONS = getAdminSkuOptions();
const FREE_DAILY_LIMIT = getFreeDailyLimit();

export default function Admin() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [access, setAccess] = useState<AdminAccessState | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [channels, setChannels] = useState<AdminChannelAccount[]>([]);
  const [linkReviews, setLinkReviews] = useState<AdminLinkReview[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [schema, setSchema] = useState<SchemaReadiness | null>(null);
  const [health, setHealth] = useState<AdminSystemHealth | null>(null);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogRow[]>([]);
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [loading, setLoading] = useState(false);

  const [customerSearch, setCustomerSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<"all" | AdminCustomer["plan"]>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "merged" | "blocked">("all");
  const [channelFilter, setChannelFilter] = useState<"all" | "telegram" | "zalo" | "web">("all");
  const [channelLinkTarget, setChannelLinkTarget] = useState("");

  const [payFilters, setPayFilters] = useState({
    query: "",
    status: "all",
    provider: "all",
    sku: "all",
    channel: "all",
  });
  const [payForm, setPayForm] = useState<PayFormState>({
    userId: "",
    amount: "",
    billingSku: "monthly",
    txCode: "",
    note: "",
  });
  const [orderReviewForm, setOrderReviewForm] = useState<OrderReviewFormState>({
    orderCode: "",
    amount: "",
    txCode: "",
    note: "",
  });

  const [catalogSearch, setCatalogSearch] = useState("");
  const [candidateStatus, setCandidateStatus] = useState("pending");
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

  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [customer360, setCustomer360] = useState<AdminCustomer360 | null>(null);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportNoteDraft, setSupportNoteDraft] = useState("");
  const [portalAuthValue, setPortalAuthValue] = useState("");
  const [customerPhoneDraft, setCustomerPhoneDraft] = useState("");
  const [mergeSourceCustomerId, setMergeSourceCustomerId] = useState("");

  const [memberForm, setMemberForm] = useState<MemberFormState>(defaultMemberForm());

  const rawSection = searchParams.get("section") ?? "overview";
  const sectionAliasMap: Record<string, AdminSection> = {
    customers: "users",
    channels: "users",
    payments: "subscriptions",
    catalog: "nutrition-data",
    settings: "security",
  };
  const section = (
    sectionAliasMap[rawSection] ??
    ([
      "overview",
      "users",
      "subscriptions",
      "entitlements",
      "usage",
      "nutrition-data",
      "support",
      "analytics",
      "system",
      "security",
    ] as string[]).includes(rawSection)
      ? (rawSection as AdminSection)
      : "overview"
  );
  const roles = access?.roles ?? [];
  const isOwner = access?.isOwner === true || roles.includes("super_admin");
  const canFinance = isOwner || roles.includes("billing_admin");
  const canCatalog = isOwner || roles.includes("content_admin");
  const canSupport = isOwner || roles.includes("support_admin");
  const canAnalytics = isOwner || roles.includes("analyst") || canFinance;

  const setSection = useCallback(
    (nextSection: AdminSection) => {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("section", nextSection);
      setSearchParams(nextParams, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const fetchBaseData = useCallback(async () => {
    const [
      nextAccess,
      nextUsers,
      nextCustomers,
      nextChannels,
      nextLinkReviews,
      nextPayments,
      nextStats,
      nextSchema,
      nextHealth,
      nextAudit,
      nextMembers,
    ] = await Promise.all([
      getAdminAccessState(),
      fetchAdminUsers().catch(() => []),
      fetchAdminCustomers().catch(() => []),
      fetchAdminChannelAccounts().catch(() => []),
      fetchAdminLinkReviews().catch(() => []),
      fetchPayments().catch(() => []),
      getSystemStats().catch(() => null),
      getSaasSchemaReadiness().catch(() => null),
      fetchAdminSystemHealth().catch(() => null),
      fetchAdminAuditLog(25).catch(() => []),
      fetchAdminMembers().catch(() => []),
    ]);

    setAccess(nextAccess);
    setUsers(nextUsers);
    setCustomers(nextCustomers);
    setChannels(nextChannels);
    setLinkReviews(nextLinkReviews);
    setPayments(nextPayments);
    setStats(nextStats);
    setSchema(nextSchema);
    setHealth(nextHealth);
    setAuditLogs(nextAudit);
    setMembers(nextMembers);
  }, []);

  const fetchCatalogData = useCallback(async () => {
    const [nextFoods, nextCandidates] = await Promise.all([
      fetchFoodCatalog(catalogSearch).catch(() => []),
      fetchFoodCandidates(candidateStatus === "all" ? "" : candidateStatus).catch(() => []),
    ]);
    setFoods(nextFoods);
    setCandidates(nextCandidates);
  }, [catalogSearch, candidateStatus]);

  const fetchCustomerSupport = useCallback(async (customerId: number) => {
    setSupportLoading(true);
    try {
      const data = await fetchAdminCustomer360(customerId);
      setCustomer360(data);
      setCustomerPhoneDraft(data.customer?.phone_display || data.customer?.phone_e164 || "");
    } catch (error) {
      toast.error(String((error as Error)?.message || error));
    } finally {
      setSupportLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBaseData();
  }, [fetchBaseData]);

  useEffect(() => {
    if (section === "nutrition-data") {
      fetchCatalogData();
    }
  }, [section, fetchCatalogData]);

  useEffect(() => {
    if (section === "support" && selectedCustomerId) {
      fetchCustomerSupport(selectedCustomerId);
    }
  }, [section, selectedCustomerId, fetchCustomerSupport]);

  const navItems = useMemo(
    () =>
      getAdminNavItems(access, {
        users: customers.length,
        subscriptions: payments.filter((payment) => payment.status === "pending").length,
        entitlements: customers.filter((customer) => customer.plan === "lifetime").length,
        usage: customers.filter((customer) => customer.quota_used_today >= FREE_DAILY_LIMIT).length,
        "nutrition-data": candidates.length,
        support: selectedCustomerId ?? null,
        analytics: canAnalytics ? customers.filter((customer) => customer.plan !== "free").length : null,
        system: health?.schemaReady ? null : "check",
        security: members.length,
      }),
    [access, customers, payments, candidates.length, selectedCustomerId, health?.schemaReady, members.length, canAnalytics],
  );

  useEffect(() => {
    if (!access) {
      return;
    }
    if (!navItems.find((item) => item.key === section) && navItems[0]) {
      setSection(navItems[0].key);
    }
  }, [access, navItems, section, setSection]);

  const filteredCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();
    return customers.filter((customer) => {
      const matchesQuery =
        !query ||
        String(customer.id).includes(query) ||
        String(customer.phone_display ?? "").toLowerCase().includes(query) ||
        String(customer.phone_e164 ?? "").toLowerCase().includes(query) ||
        String(customer.full_name ?? "").toLowerCase().includes(query);
      const matchesPlan = planFilter === "all" || customer.plan === planFilter;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && customer.status === "active") ||
        (statusFilter === "merged" && customer.status === "merged") ||
        (statusFilter === "blocked" && customer.status === "blocked");
      return matchesQuery && matchesPlan && matchesStatus;
    });
  }, [customers, customerSearch, planFilter, statusFilter]);

  const filteredChannels = useMemo(
    () => channels.filter((channel) => channelFilter === "all" || channel.channel === channelFilter),
    [channels, channelFilter],
  );

  const filteredPayments = useMemo(() => {
    const query = payFilters.query.trim().toLowerCase();
    return payments.filter((payment) => {
      const matchesQuery =
        !query ||
        String(payment.user_id).includes(query) ||
        String(payment.customer_id ?? "").includes(query) ||
        String(payment.customer_phone ?? "").toLowerCase().includes(query) ||
        String(payment.user_name ?? "").toLowerCase().includes(query) ||
        String(payment.transaction_code ?? "").toLowerCase().includes(query);
      const matchesStatus = payFilters.status === "all" || payment.status === payFilters.status;
      const matchesProvider = payFilters.provider === "all" || payment.payment_method === payFilters.provider;
      const matchesSku = payFilters.sku === "all" || payment.billing_sku === payFilters.sku;
      const matchesChannel = payFilters.channel === "all" || (payment.channel ?? "telegram") === payFilters.channel;
      return matchesQuery && matchesStatus && matchesProvider && matchesSku && matchesChannel;
    });
  }, [payments, payFilters]);

  const withRefresh = async (
    fn: () => Promise<void>,
    successMessage: string,
    options?: { refreshCatalog?: boolean; refreshSupport?: boolean },
  ) => {
    try {
      setLoading(true);
      await fn();
      toast.success(successMessage);
      await fetchBaseData();
      if (options?.refreshCatalog) {
        await fetchCatalogData();
      }
      if (options?.refreshSupport && selectedCustomerId) {
        await fetchCustomerSupport(selectedCustomerId);
      }
    } catch (error) {
      toast.error(String((error as Error)?.message || error));
    } finally {
      setLoading(false);
    }
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
    setPromoteForm(defaultPromoteCandidateForm(null));
    setAliasInput("");
  };

  const handleLogPayment = async () => {
    if (!payForm.userId || !payForm.amount) {
      toast.error("User ID và số tiền là bắt buộc");
      return;
    }
    await withRefresh(
      () => logPayment(Number(payForm.userId), Number(payForm.amount), payForm.billingSku, payForm.txCode, payForm.note),
      "Đã ghi giao dịch và cấp gói thành công",
      { refreshSupport: selectedCustomerId === Number(payForm.userId) },
    );
    setPayForm({ userId: "", amount: "", billingSku: "monthly", txCode: "", note: "" });
  };

  const handleMarkOrderPaid = async () => {
    if (!orderReviewForm.orderCode.trim()) {
      toast.error("Order code lÃ  báº¯t buá»™c");
      return;
    }
    await withRefresh(
      () =>
        markOrderPaid(
          orderReviewForm.orderCode.trim().toUpperCase(),
          asNumberOrNull(orderReviewForm.amount),
          orderReviewForm.txCode,
          orderReviewForm.note,
        ),
      "ÄÃ£ xÃ¡c nháº­n order vÃ  grant entitlement",
    );
    setOrderReviewForm({ orderCode: "", amount: "", txCode: "", note: "" });
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
    if (!selectedFoodId || !aliasInput.trim()) {
      toast.error("Cần chọn food và nhập alias");
      return;
    }
    await withRefresh(
      () =>
        upsertFoodAlias({
          foodId: selectedFoodId,
          alias: aliasInput.trim(),
          aliasType: "common_name",
          isPrimary: false,
          sourceType: "manual",
          confidence: 1,
        }).then(() => undefined),
      "Đã thêm alias",
      { refreshCatalog: true },
    );
    setAliasInput("");
  };

  const handleSaveNutrition = async () =>
    withRefresh(
      () =>
        upsertFoodNutrition({
          foodId: selectedFoodId ?? 0,
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
        }),
      "Đã lưu nutrition",
      { refreshCatalog: true },
    );

  const handleSavePortion = async () =>
    withRefresh(
      () =>
        upsertFoodPortion({
          foodId: selectedFoodId ?? 0,
          label: portionForm.label.trim(),
          grams: asNumberOrNull(portionForm.grams) ?? 0,
          quantityValue: asNumberOrNull(portionForm.quantityValue) ?? 1,
          quantityUnit: portionForm.quantityUnit.trim() || null,
          portionType: portionForm.portionType.trim() || "serving",
          sourceType: portionForm.sourceType.trim() || "manual",
          confidence: asNumberOrNull(portionForm.confidence) ?? 1,
          isDefault: portionForm.isDefault,
        }).then(() => undefined),
      "Đã lưu portion",
      { refreshCatalog: true },
    );

  const handleLoadCandidateIntoForm = (candidate: FoodCandidateRow) => {
    setPromoteForm(defaultPromoteCandidateForm(candidate));
    setSection("nutrition-data");
  };

  const handlePromoteCandidate = async () =>
    withRefresh(
      () =>
        promoteFoodCandidate({
          candidateId: promoteForm.candidateId ?? 0,
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
          aliases: promoteForm.aliases.split(",").map((alias) => alias.trim()).filter(Boolean),
        }).then(() => undefined),
      "Đã promote candidate thành food",
      { refreshCatalog: true },
    );

  const handleQuickPromoteCandidate = async (candidate: FoodCandidateRow) =>
    withRefresh(
      () =>
        promoteFoodCandidate({
          candidateId: candidate.id,
          name: candidate.suggested_food_name ?? candidate.raw_name,
          servingLabel: candidate.suggested_serving_label ?? "100g",
          servingGrams: 100,
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
          aliases: [candidate.raw_name],
        }).then(() => undefined),
      "Đã promote candidate nhanh",
      { refreshCatalog: true },
    );

  const handleCsvFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    setCsvText(await file.text());
  };

  const handleCsvDryRun = async () => {
    const rows = parseFoodCsvText(csvText);
    if (!rows.length) {
      toast.error("CSV cần có header và ít nhất 1 dòng dữ liệu");
      return;
    }
    try {
      setLoading(true);
      setCsvDryRun(await dryRunFoodCsvImport(rows));
      toast.success("Dry-run CSV thành công");
    } catch (error) {
      toast.error(String((error as Error)?.message || error));
    } finally {
      setLoading(false);
    }
  };

  const handleCsvCommit = async () =>
    withRefresh(
      async () => {
        const rows = parseFoodCsvText(csvText);
        if (!rows.length) {
          throw new Error("CSV cần có dữ liệu hợp lệ trước khi commit");
        }
        await commitFoodCsvImport(rows);
      },
      "CSV import đã được commit",
      { refreshCatalog: true },
    );

  const handleOpenCustomerSupport = (customer: AdminCustomer) => {
    setSelectedCustomerId(customer.id);
    setCustomerPhoneDraft(customer.phone_display || customer.phone_e164 || "");
    setSection("support");
  };

  const handleSetCustomerFree = async (customerId: number) =>
    withRefresh(
      () => setCustomerEntitlement(customerId, "free", null, "admin", "Set customer to Free"),
      "Đã chuyển customer về Free",
      { refreshSupport: selectedCustomerId === customerId },
    );

  const handleGrantCustomerPro = async (customerId: number) =>
    withRefresh(
      () =>
        setCustomerEntitlement(
          customerId,
          "pro",
          computePremiumUntil("monthly"),
          "manual_grant",
          "Grant Pro từ backoffice",
        ),
      "Đã grant Pro cho customer",
      { refreshSupport: selectedCustomerId === customerId },
    );

  const handleGrantCustomerLifetime = async (customerId: number) =>
    withRefresh(
      () =>
        setCustomerEntitlement(
          customerId,
          "lifetime",
          LIFETIME_SENTINEL_ISO,
          "manual_grant",
          "Grant Lifetime từ backoffice",
        ),
      "Đã grant Lifetime cho customer",
      { refreshSupport: selectedCustomerId === customerId },
    );

  const handleLinkChannel = async (channelAccountId: number, customerId: number) =>
    withRefresh(
      () => linkChannelAccount(channelAccountId, customerId, "Linked from admin channels section"),
      "Đã link channel vào customer",
      { refreshSupport: selectedCustomerId === customerId },
    );

  const handleUnlinkChannel = async (channelAccountId: number) =>
    withRefresh(
      () => unlinkChannelAccount(channelAccountId, "Unlinked from admin channels section"),
      "Đã unlink channel account",
      { refreshSupport: true },
    );

  const handleSetCustomerPhone = async () => {
    if (!selectedCustomerId || !customerPhoneDraft.trim()) return;
    await withRefresh(
      () => setCustomerPhone(selectedCustomerId, customerPhoneDraft.trim(), customer360?.customer?.full_name || undefined),
      "Đã cập nhật số điện thoại canonical",
      { refreshSupport: true },
    );
  };

  const handleResetQuota = async () => {
    if (!selectedCustomerId) return;
    await withRefresh(() => resetCustomerQuota(selectedCustomerId), "Đã reset quota dùng chung", {
      refreshSupport: true,
    });
  };

  const handleLinkPortalAuth = async () => {
    if (!selectedCustomerId || !portalAuthValue.trim()) return;
    await withRefresh(
      () => linkPortalAuth(selectedCustomerId, portalAuthValue.trim(), customer360?.linkedAuths[0]?.email || ""),
      "Đã link portal auth",
      { refreshSupport: true },
    );
    setPortalAuthValue("");
  };

  const handleAddSupportNote = async () => {
    if (!selectedCustomerId || !supportNoteDraft.trim()) return;
    await withRefresh(() => addCustomerSupportNote(selectedCustomerId, supportNoteDraft.trim()), "Đã lưu support note", {
      refreshSupport: true,
    });
    setSupportNoteDraft("");
  };

  const handleMergeCustomer = async () => {
    if (!selectedCustomerId || !mergeSourceCustomerId.trim()) return;
    await withRefresh(
      () => mergeCustomers(Number(mergeSourceCustomerId), selectedCustomerId, "Merged từ support console"),
      "Đã merge customer",
      { refreshSupport: true },
    );
    setMergeSourceCustomerId("");
  };

  const handleSaveMember = async () => {
    if (!memberForm.linkedUserId.trim()) {
      toast.error("Linked user ID là bắt buộc");
      return;
    }
    await withRefresh(async () => {
      const memberId = await upsertAdminMember({
        linkedUserId: Number(memberForm.linkedUserId),
        authUserId: memberForm.authUserId.trim() || null,
        displayName: memberForm.displayName.trim() || null,
        isOwner: memberForm.isOwner,
      });
      await setAdminMemberRoles(memberId, memberForm.roles);
    }, "Đã lưu admin member");
    setMemberForm(defaultMemberForm());
  };

  const handleApplyRoles = async (member: AdminMember, nextRoles: AdminRole[]) =>
    withRefresh(() => setAdminMemberRoles(member.id, nextRoles), "Đã cập nhật roles");

  const handleToggleMemberActive = async (member: AdminMember) =>
    withRefresh(
      () => toggleAdminMemberActive(member.id, !member.is_active),
      member.is_active ? "Đã deactivate member" : "Đã activate member",
    );

  const sectionMeta = useMemo(() => {
    switch (section) {
      case "users":
        return {
          eyebrow: "User management",
          title: "Customer canonical, channel identities và account health",
          description:
            "Phone number là tài khoản chính. Màn này gom customer canonical, Telegram/Zalo/web-linked identities và các thao tác support hoặc entitlement ở mức user lifecycle.",
        };
      case "subscriptions":
        return {
          eyebrow: "Subscriptions & billing",
          title: "Plans, payments, trial và revenue operations",
          description:
            "Finance nhìn được plan mix, manual grants, payment history, provider state, fail/pending queue và các tín hiệu upgrade hay churn ở cùng một nơi.",
        };
      case "entitlements":
        return {
          eyebrow: "Entitlements",
          title: "Feature flags và quyền theo tier",
          description:
            "Tách rõ feature access khỏi plan display để sau này dễ mở Pro Plus, Coach hoặc Family mà không phải hardcode lại toàn bộ ứng dụng.",
        };
      case "usage":
        return {
          eyebrow: "Usage & quota",
          title: "AI calls, meal scans, quota pressure và cost proxy",
          description:
            "Phần này giúp nhìn ra free-tier hotspots, abuse risk, chi phí AI ước tính và quota policy theo customer thay vì theo từng channel riêng lẻ.",
        };
      case "nutrition-data":
        return {
          eyebrow: "Nutrition data",
          title: "Food database, portions, aliases và candidate curation",
          description:
            "Content admin dùng khu vực này để sửa nutrition data, promote candidate, import CSV và làm sạch catalog để AI ưu tiên DB trước estimate.",
        };
      case "support":
        return {
          eyebrow: "Support & moderation",
          title: "Customer 360, notes, repair flows và quota reset",
          description:
            "Support tập trung vào complaints, link repair, portal auth, merge customer, reset quota và note nội bộ để không mất bối cảnh hỗ trợ.",
        };
      case "analytics":
        return {
          eyebrow: "Analytics & growth",
          title: "Signup, conversion, retention và revenue signals",
          description:
            "Analyst và business team theo dõi growth funnel, active users, Free → Paid conversion và xu hướng revenue theo cùng token system với landing page.",
        };
      case "system":
        return {
          eyebrow: "System health",
          title: "Schema, webhook, queue và vận hành nền",
          description:
            "Theo dõi migration readiness, error feed, payment webhook status, audit stream và các tín hiệu backend cần xử lý trước khi nó thành issue cho user.",
        };
      case "security":
        return {
          eyebrow: "Security & permissions",
          title: "Admin roles, audit trail và break-glass owner",
          description:
            "Tất cả quyền nhạy cảm phải đi qua RPC và audit log. Màn này là nơi nhìn thấy member roles, owner state và các thay đổi cần kiểm toán.",
        };
      default:
        return {
          eyebrow: "Dashboard tổng quan",
          title: "CaloTrack Admin Area",
          description:
            "Một màn admin duy nhất cho customer canonical theo số điện thoại, channel identities, payments, catalog foods, support operations và system health. Giao diện này bám cùng visual language với main page: teal là primary, flame là accent.",
        };
    }
  }, [section]);

  const headerSummary = useMemo(
    () => [
      { label: "free tier", value: `${FREE_DAILY_LIMIT}/ngày`, tone: "neutral" as const },
      { label: "customers", value: String(customers.length), tone: "primary" as const },
      {
        label: "channels",
        value: `${channels.filter((channel) => channel.link_status === "linked").length} linked`,
        tone: "accent" as const,
      },
      { label: "roles", value: access?.roles?.length ? access.roles.join(" · ") : "bootstrap", tone: "neutral" as const },
    ],
    [access, channels, customers.length],
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(249,115,22,0.08),_transparent_24%),linear-gradient(180deg,#f7fbfa_0%,#ffffff_46%,#f8fafc_100%)]">
      <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6 xl:px-8">
        <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <AdminSidebar items={navItems} section={section} onSelect={setSection} access={access} />

          <div className="space-y-6">
            <AdminSectionHeader
              eyebrow={sectionMeta.eyebrow}
              title={sectionMeta.title}
              description={sectionMeta.description}
              summary={headerSummary}
              actions={
                <>
                  <Button variant="outline" onClick={fetchBaseData}>
                    Refresh all
                  </Button>
                  <Button onClick={() => window.open("/", "_blank")}>Ra main page</Button>
                </>
              }
            />

            {section === "overview" ? (
              <OverviewPanel
                stats={stats}
                users={users}
                payments={payments}
                health={health}
                schema={schema}
                onRefresh={fetchBaseData}
              />
            ) : null}

            {section === "users" ? (
              <div className="space-y-6">
                <CustomersPanel
                  customers={filteredCustomers}
                  search={customerSearch}
                  onSearchChange={setCustomerSearch}
                  planFilter={planFilter}
                  onPlanFilterChange={setPlanFilter}
                  statusFilter={statusFilter}
                  onStatusFilterChange={setStatusFilter}
                  onOpenSupport={handleOpenCustomerSupport}
                  onSetFree={handleSetCustomerFree}
                  onGrantPro={handleGrantCustomerPro}
                  onGrantLifetime={handleGrantCustomerLifetime}
                  canFinance={canFinance}
                />
                <ChannelsPanel
                  channels={filteredChannels}
                  linkReviews={linkReviews}
                  filter={channelFilter}
                  onFilterChange={setChannelFilter}
                  targetCustomerId={channelLinkTarget}
                  onTargetCustomerIdChange={setChannelLinkTarget}
                  onLink={handleLinkChannel}
                  onUnlink={handleUnlinkChannel}
                  canSupport={canSupport}
                />
              </div>
            ) : null}

            {section === "subscriptions" ? (
              <div className="space-y-6">
                <SubscriptionsOverviewPanel customers={customers} payments={payments} stats={stats} />
                <PaymentsPanel
                  filteredPayments={filteredPayments}
                  query={payFilters.query}
                  onQueryChange={(value) => setPayFilters((prev) => ({ ...prev, query: value }))}
                  statusFilter={payFilters.status}
                  onStatusFilterChange={(value) => setPayFilters((prev) => ({ ...prev, status: value }))}
                  providerFilter={payFilters.provider}
                  onProviderFilterChange={(value) => setPayFilters((prev) => ({ ...prev, provider: value }))}
                  skuFilter={payFilters.sku}
                  onSkuFilterChange={(value) => setPayFilters((prev) => ({ ...prev, sku: value }))}
                  channelFilter={payFilters.channel}
                  onChannelFilterChange={(value) => setPayFilters((prev) => ({ ...prev, channel: value }))}
                  payForm={payForm}
                  onPayFormChange={(patch) => setPayForm((prev) => ({ ...prev, ...patch }))}
                  orderReviewForm={orderReviewForm}
                  onOrderReviewFormChange={(patch) => setOrderReviewForm((prev) => ({ ...prev, ...patch }))}
                  skuOptions={SKU_OPTIONS}
                  onSubmitManualPayment={handleLogPayment}
                  onMarkOrderPaid={handleMarkOrderPaid}
                  canFinance={canFinance}
                  loading={loading}
                />
              </div>
            ) : null}

            {section === "entitlements" ? <EntitlementsPanel customers={customers} /> : null}

            {section === "usage" ? (
              <UsagePanel customers={customers} channels={channels} stats={stats} />
            ) : null}

            {section === "nutrition-data" ? (
              <CatalogPanel
                state={{
                  schemaReady: Boolean(schema?.ready),
                  canCatalogWrite: canCatalog,
                  loading,
                  foods,
                  candidates,
                  catalogSearch,
                  candidateStatus,
                  selectedFoodId,
                  foodForm,
                  aliasInput,
                  nutritionForm,
                  portionForm,
                  promoteForm,
                  csvText,
                  csvFileName,
                  csvDryRun,
                }}
                handlers={{
                  onCatalogSearchChange: setCatalogSearch,
                  onCandidateStatusChange: setCandidateStatus,
                  onRefresh: fetchCatalogData,
                  onSelectFood: handleSelectFood,
                  onResetFoodForms: resetFoodForms,
                  setFoodForm,
                  onAliasInputChange: setAliasInput,
                  setNutritionForm,
                  setPortionForm,
                  setPromoteForm,
                  onCsvTextChange: setCsvText,
                  onSaveFood: handleSaveFood,
                  onAddAlias: handleAddAlias,
                  onSaveNutrition: handleSaveNutrition,
                  onSavePortion: handleSavePortion,
                  onLoadCandidateIntoForm: handleLoadCandidateIntoForm,
                  onPromoteCandidate: handlePromoteCandidate,
                  onQuickPromoteCandidate: handleQuickPromoteCandidate,
                  onCsvFile: handleCsvFile,
                  onCsvDryRun: handleCsvDryRun,
                  onCsvCommit: handleCsvCommit,
                }}
              />
            ) : null}

            {section === "support" ? (
              <CustomerSupportPanel
                customers={customers}
                selectedCustomerId={selectedCustomerId}
                onSelectCustomer={setSelectedCustomerId}
                customer360={customer360}
                loading={supportLoading}
                noteDraft={supportNoteDraft}
                onNoteDraftChange={setSupportNoteDraft}
                authUserIdDraft={portalAuthValue}
                onAuthUserIdDraftChange={setPortalAuthValue}
                phoneDraft={customerPhoneDraft}
                onPhoneDraftChange={setCustomerPhoneDraft}
                mergeSourceId={mergeSourceCustomerId}
                onMergeSourceIdChange={setMergeSourceCustomerId}
                onRefresh={() => (selectedCustomerId ? fetchCustomerSupport(selectedCustomerId) : Promise.resolve())}
                onSetPhone={handleSetCustomerPhone}
                onResetQuota={handleResetQuota}
                onLinkPortalAuth={handleLinkPortalAuth}
                onAddNote={handleAddSupportNote}
                onMergeCustomer={handleMergeCustomer}
                canSupport={canSupport}
              />
            ) : null}

            {section === "analytics" ? (
              <AnalyticsPanel users={users} customers={customers} payments={payments} />
            ) : null}

            {section === "system" ? (
              <SystemPanel schema={schema} health={health} auditLogs={auditLogs} onRefresh={fetchBaseData} />
            ) : null}

            {section === "security" ? (
              <div className="space-y-6">
                <SecurityPanel access={access} members={members} auditLogs={auditLogs} />
                <SettingsPanel
                  access={access}
                  members={members}
                  memberForm={memberForm}
                  onMemberFormChange={(patch) => setMemberForm((prev) => ({ ...prev, ...patch }))}
                  onSaveMember={handleSaveMember}
                  onToggleMemberActive={handleToggleMemberActive}
                  onApplyRoles={handleApplyRoles}
                  canManageMembers={isOwner}
                  skuOptions={SKU_OPTIONS}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
