import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  CreditCard,
  ExternalLink,
  Loader2,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatTierLabel, getBillingCheckoutLabel } from "@/lib/billing";
import {
  fetchPortalSnapshot,
  getPortalChannelLink,
  normalizePortalChannelStatus,
  portalCreateTelegramLinkToken,
  portalCreateZaloLinkToken,
  type PortalSnapshot,
} from "@/lib/portalApi";
import { SITE_CONFIG, getPrimaryChannelHref } from "@/lib/siteConfig";
import { supabase } from "@/lib/supabase";
import { usePortalSiteConfig } from "@/contexts/PortalSiteConfigContext";
import { MacroTracker } from "../components/dashboard/MacroTracker";

const SURFACE =
  "relative overflow-hidden rounded-[32px] border border-white/40 bg-white/60 p-6 shadow-elegant backdrop-blur-xl transition-all";
const SUBSURFACE =
  "group relative overflow-hidden rounded-[28px] border border-primary/10 bg-white/70 p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-white/90 hover:shadow-md";
const CHANNEL_POLL_INTERVAL_MS = 4000;
const CHANNEL_POLL_TIMEOUT_MS = 120000;

type ChannelKey = "telegram" | "zalo";
type ChannelUiStatus =
  | "linked"
  | "unlinked"
  | "linking"
  | "pending_review"
  | "needs_support"
  | "invalid"
  | "expired";

type ChannelFlowState = {
  status: ChannelUiStatus;
  helperText: string | null;
  expiresAt: string | null;
  linkCode: string | null;
  reused: boolean;
  timedOut: boolean;
  startedAt: number | null;
};

const INITIAL_CHANNEL_FLOW: ChannelFlowState = {
  status: "unlinked",
  helperText: null,
  expiresAt: null,
  linkCode: null,
  reused: false,
  timedOut: false,
  startedAt: null,
};

function formatDate(value: string | null | undefined) {
  if (!value) return "Chưa có";
  return new Date(value).toLocaleString("vi-VN");
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return "Chưa có";
  return new Date(value).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function planTone(plan: PortalSnapshot["plan"]) {
  if (plan === "lifetime") return "border-accent/20 bg-accent/10 text-accent";
  if (plan === "pro") return "border-primary/15 bg-primary/10 text-primary";
  return "border-border bg-white text-zinc-600";
}

function deriveEntitlementLabel(snapshot: PortalSnapshot | null) {
  if (!snapshot) return "Đang đồng bộ entitlement...";
  if (snapshot.accessState === "trialing") {
    return snapshot.trialEndsAt
      ? `Pro dùng thử 7 ngày đang hoạt động tới ${new Date(snapshot.trialEndsAt).toLocaleDateString("vi-VN")}.`
      : "Pro dùng thử 7 ngày đang hoạt động.";
  }
  if (snapshot.accessState === "free_limited") {
    return "Free linh hoạt đang hoạt động sau giai đoạn dùng thử.";
  }
  if (snapshot.plan === "pro" && snapshot.premiumUntil) {
    return `Pro đang hoạt động tới ${new Date(snapshot.premiumUntil).toLocaleDateString("vi-VN")}.`;
  }
  if (snapshot.plan === "lifetime") {
    return "Gói trọn đời đang hoạt động trên hệ thống.";
  }
  return "Xác thực số điện thoại để bắt đầu dùng.";
}

function deriveQuotaLabel(
  snapshot: PortalSnapshot | null,
  freeDailyLimit: number,
) {
  if (!snapshot) return "Đang tải quota...";
  if (
    snapshot.accessState === "trialing" ||
    snapshot.accessState === "free_limited"
  ) {
    return `${snapshot.dailyAiUsageCount}/${freeDailyLimit} lượt dùng trong ngày`;
  }
  if (snapshot.plan === "pro" || snapshot.plan === "lifetime") {
    return "Quota theo gói đang hoạt động";
  }
  return "Đang đồng bộ dữ liệu sử dụng";
}

function getTrialDaysRemaining(trialEndsAt: string | null | undefined) {
  const timestamp = Date.parse(String(trialEndsAt || ""));
  if (!Number.isFinite(timestamp)) return null;
  const remainingMs = timestamp - Date.now();
  if (remainingMs <= 0) return 0;
  return Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
}

function getLiveChannelStatus(
  snapshot: PortalSnapshot | null,
  channel: ChannelKey,
): ChannelUiStatus {
  return normalizePortalChannelStatus(
    getPortalChannelLink(snapshot, channel)?.linkStatus,
  );
}

function syncChannelFlowWithSnapshot(
  current: ChannelFlowState,
  snapshot: PortalSnapshot | null,
  channel: ChannelKey,
): ChannelFlowState {
  const liveStatus = getLiveChannelStatus(snapshot, channel);

  if (liveStatus === "linked") {
    return {
      ...current,
      status: "linked",
      helperText:
        channel === "telegram"
          ? "Telegram đã được liên kết với dữ liệu huấn luyện của bạn."
          : "Zalo đã được liên kết với dữ liệu huấn luyện của bạn.",
      expiresAt: null,
      linkCode: null,
      timedOut: false,
      startedAt: null,
    };
  }

  if (liveStatus === "needs_support" || liveStatus === "pending_review") {
    return {
      ...current,
      status: liveStatus,
      helperText:
        liveStatus === "needs_support"
          ? "Kênh này đang gắn với một tài khoản khác. Vui lòng liên hệ hỗ trợ."
          : "Kênh đã được nhận diện nhưng chưa được hợp nhất dữ liệu.",
      timedOut: false,
    };
  }

  if (current.status !== "linking") {
    return {
      ...current,
      status: liveStatus,
    };
  }

  return current;
}

function fallbackSnapshot(user: {
  email?: string | null;
  phone?: string | null;
}): PortalSnapshot {
  return {
    customerId: null,
    linkedUserId: null,
    email: user.email ?? null,
    phoneE164: user.phone ?? null,
    phoneDisplay: user.phone ?? null,
    fullName: null,
    plan: "free",
    premiumUntil: null,
    trialEndsAt: null,
    accessState: "pending_verification",
    onboardingStatus: null,
    dailyAiUsageCount: 0,
    entitlementSource: null,
    entitlementLabel:
      "Elite AI Coach luôn đồng hành cùng bạn. Vui lòng xác thực số điện thoại để bắt đầu.",
    quotaLabel: `0/${SITE_CONFIG.freeDailyLimit} lượt AI hôm nay`,
    source: "auth_only",
    payments: [],
    linkedChannels: [],
    lastSyncAt: new Date().toISOString(),
  };
}

async function copyText(value: string) {
  if (!value) return false;
  if (!navigator?.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function getChannelTitle(channel: ChannelKey) {
  return channel === "telegram" ? "Telegram" : "Zalo";
}

function getChannelOpenUrl(
  channel: ChannelKey,
  siteConfig: Pick<typeof SITE_CONFIG, "telegramBotUrl" | "zaloOaUrl">,
) {
  return channel === "telegram"
    ? siteConfig.telegramBotUrl
    : siteConfig.zaloOaUrl;
}

export default function Dashboard() {
  const { siteConfig } = usePortalSiteConfig();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<PortalSnapshot | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [zaloLoading, setZaloLoading] = useState(false);
  const [zaloGuideOpen, setZaloGuideOpen] = useState(false);
  const [channelFlows, setChannelFlows] = useState<
    Record<ChannelKey, ChannelFlowState>
  >({
    telegram: { ...INITIAL_CHANNEL_FLOW },
    zalo: { ...INITIAL_CHANNEL_FLOW },
  });

  async function loadSnapshot(options?: { silent?: boolean }) {
    if (!user) return null;
    if (!options?.silent) {
      setLoading(true);
    }

    try {
      const next = await fetchPortalSnapshot({
        id: user.id,
        email: user.email,
        phone: user.phone,
      });
      setSnapshot(next);
      setSnapshotError(null);
      setPhoneDraft(next.phoneDisplay || next.phoneE164 || user.phone || "");
      return next;
    } catch (error) {
      const fallback = fallbackSnapshot({
        email: user.email,
        phone: user.phone,
      });
      setSnapshot(fallback);
      setSnapshotError(
        String(
          (error as Error)?.message ||
            "Không thể tải dashboard lúc này. Bạn có thể làm mới hoặc đăng nhập lại.",
        ),
      );
      setPhoneDraft(
        fallback.phoneDisplay || fallback.phoneE164 || user.phone || "",
      );
      return fallback;
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    if (user) return;
    navigate("/login?next=/dashboard", { replace: true });
  }, [navigate, user]);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const next = await loadSnapshot();
      if (cancelled || !next) return;
      setChannelFlows((current) => ({
        telegram: syncChannelFlowWithSnapshot(
          current.telegram,
          next,
          "telegram",
        ),
        zalo: syncChannelFlowWithSnapshot(current.zalo, next, "zalo"),
      }));
    }

    void boot();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!snapshot) return;
    setChannelFlows((current) => ({
      telegram: syncChannelFlowWithSnapshot(
        current.telegram,
        snapshot,
        "telegram",
      ),
      zalo: syncChannelFlowWithSnapshot(current.zalo, snapshot, "zalo"),
    }));
  }, [snapshot]);

  useEffect(() => {
    if (channelFlows.zalo.status === "linked") {
      setZaloGuideOpen(false);
    }
  }, [channelFlows.zalo.status]);

  useEffect(() => {
    if (!user) return undefined;

    const activeChannels = (["telegram", "zalo"] as ChannelKey[]).filter(
      (channel) => channelFlows[channel].status === "linking",
    );

    if (!activeChannels.length) {
      return undefined;
    }

    let disposed = false;

    const poll = async () => {
      if (disposed) return;

      const now = Date.now();
      const expiredChannels = activeChannels.filter((channel) => {
        const expiresAt = channelFlows[channel].expiresAt;
        if (!expiresAt) return false;
        const expiresAtTs = Date.parse(expiresAt);
        return Number.isFinite(expiresAtTs) && expiresAtTs <= now;
      });

      if (expiredChannels.length) {
        setChannelFlows((current) => {
          const next = { ...current };
          for (const channel of expiredChannels) {
            next[channel] = {
              ...current[channel],
              status: "expired",
              helperText:
                "Mã liên kết đã hết hạn. Tạo mã mới từ dashboard để thử lại.",
              timedOut: false,
            };
          }
          return next;
        });
        return;
      }

      const timedOutChannels = activeChannels.filter((channel) => {
        const startedAt = channelFlows[channel].startedAt ?? now;
        return now - startedAt >= CHANNEL_POLL_TIMEOUT_MS;
      });

      if (timedOutChannels.length) {
        setChannelFlows((current) => {
          const next = { ...current };
          for (const channel of timedOutChannels) {
            next[channel] = {
              ...current[channel],
              status: "linking",
              helperText:
                channel === "telegram"
                  ? "Đã mở Telegram nhưng chưa xác nhận xong. Bạn có thể mở lại bot hoặc làm mới trạng thái."
                  : "Đã mở Zalo nhưng chưa xác nhận xong. Gửi mã một lần trong OA rồi quay lại dashboard để hệ thống tự nhận liên kết.",
              timedOut: true,
            };
          }
          return next;
        });
      }

      const nextSnapshot = await loadSnapshot({ silent: true });
      if (!nextSnapshot || disposed) return;

      setChannelFlows((current) => {
        const next = { ...current };
        for (const channel of activeChannels) {
          next[channel] = syncChannelFlowWithSnapshot(
            current[channel],
            nextSnapshot,
            channel,
          );
        }
        return next;
      });
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, CHANNEL_POLL_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [
    user,
    channelFlows.telegram.status,
    channelFlows.telegram.expiresAt,
    channelFlows.telegram.startedAt,
    channelFlows.zalo.status,
    channelFlows.zalo.expiresAt,
    channelFlows.zalo.startedAt,
  ]);

  const linkedChannelsCount =
    snapshot?.linkedChannels.filter((item) => item.linkStatus === "linked")
      .length ?? 0;
  const accountLabel =
    snapshot?.fullName ||
    snapshot?.phoneDisplay ||
    snapshot?.phoneE164 ||
    snapshot?.email ||
    user?.email ||
    "Chưa có thông tin";
  const entitlementLabel = deriveEntitlementLabel(snapshot);
  const quotaLabel = deriveQuotaLabel(snapshot, SITE_CONFIG.freeDailyLimit);
  const trialDaysRemaining = getTrialDaysRemaining(snapshot?.trialEndsAt);
  const showTrialRenewalBanner =
    snapshot?.accessState === "trialing" &&
    trialDaysRemaining !== null &&
    trialDaysRemaining <= 2;

  const channelSummaries = useMemo(() => {
    return (["telegram", "zalo"] as ChannelKey[]).map((channel) => {
      const localState = channelFlows[channel];
      const status = localState.status;
      const linkedDisplayName = getPortalChannelLink(
        snapshot,
        channel,
      )?.displayName;
      const linkedAt = getPortalChannelLink(snapshot, channel)?.linkedAt;

      let statusLabel = "Sẵn sàng kết nối";
      let helperText =
        channel === "telegram"
          ? "One-tap qua bot Telegram. Dashboard sẽ tự làm mới trạng thái sau khi bot consume token."
          : "Tạo mã link, gửi vào OA một lần, rồi quay lại dashboard để hệ thống tự nhận liên kết.";

      if (status === "linked") {
        statusLabel = "Đã liên kết";
        helperText =
          channel === "telegram"
            ? "Telegram đã dùng chung trial, quota và customer truth với portal."
            : "Zalo đã dùng chung trial, quota và customer truth với portal.";
      } else if (status === "linking") {
        statusLabel = localState.timedOut
          ? "Đã mở, chờ xác nhận"
          : "Đang chờ xác nhận";
        helperText =
          localState.helperText ||
          (channel === "telegram"
            ? "Bot sẽ tự consume token khi bạn mở đúng deep link."
            : "Gửi mã liên kết đúng một lần trong OA để hoàn tất self-link.");
      } else if (status === "pending_review") {
        statusLabel = "Chờ hợp nhất dữ liệu";
        helperText =
          "Kênh chat đã được nhận diện nhưng chưa được kết nối với hồ sơ của bạn.";
      } else if (status === "needs_support") {
        statusLabel = "Cần hỗ trợ kỹ thuật";
        helperText =
          "Kênh này đang gắn với một tài khoản khác. Vui lòng liên hệ Coach để xử lý.";
      } else if (status === "expired") {
        statusLabel = "Mã đã hết hạn";
        helperText = "Tạo mã mới để tiếp tục kết nối với AI Coach.";
      } else if (status === "invalid") {
        statusLabel = "Mã không hợp lệ";
        helperText =
          "Mã link đã sai hoặc không còn dùng được. Tạo token mới để thử lại.";
      }

      return {
        channel,
        title: getChannelTitle(channel),
        status,
        statusLabel,
        helperText,
        linkedDisplayName,
        linkedAt,
        expiresAt: localState.expiresAt,
        linkCode: localState.linkCode,
      };
    });
  }, [channelFlows, snapshot]);

  async function handleRefresh() {
    if (!user) return;
    setLoading(true);
    try {
      const refreshed = await fetchPortalSnapshot({
        id: user.id,
        email: user.email,
        phone: user.phone,
      });
      setSnapshot(refreshed);
      setSnapshotError(null);
      setPhoneDraft(
        refreshed.phoneDisplay || refreshed.phoneE164 || user.phone || "",
      );
      toast.success("Portal snapshot đã được làm mới.");
    } catch (error) {
      setSnapshotError(
        String(
          (error as Error)?.message ||
            "Không thể làm mới dữ liệu portal. Bạn có thể thử lại hoặc đăng nhập lại.",
        ),
      );
      toast.error(
        String(
          (error as Error)?.message || "Không thể làm mới dữ liệu portal.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleTelegramLink() {
    const currentStatus = getLiveChannelStatus(snapshot, "telegram");
    if (currentStatus === "linked") {
      window.open(
        getChannelOpenUrl("telegram", siteConfig),
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }

    setTelegramLoading(true);
    try {
      const result = await portalCreateTelegramLinkToken();
      setChannelFlows((current) => ({
        ...current,
        telegram: {
          status: result.status === "already_linked" ? "linked" : "linking",
          helperText: result.helperText,
          expiresAt: result.expiresAt,
          linkCode: null,
          reused: result.reused,
          timedOut: false,
          startedAt: Date.now(),
        },
      }));
      window.open(result.url, "_blank", "noopener,noreferrer");
      toast.success(
        result.status === "already_linked"
          ? "Telegram đã liên kết sẵn. Bạn có thể mở bot và chat ngay."
          : "Đã mở Telegram bot. Dashboard sẽ tự cập nhật khi bot xác nhận liên kết.",
      );
    } catch (error) {
      toast.error(
        String(
          (error as Error)?.message || "Không thể mở flow tự link Telegram.",
        ),
      );
    } finally {
      setTelegramLoading(false);
    }
  }

  async function handleZaloLink() {
    const currentStatus = getLiveChannelStatus(snapshot, "zalo");
    if (currentStatus === "linked") {
      window.open(
        getChannelOpenUrl("zalo", siteConfig),
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }

    setZaloLoading(true);
    try {
      const result = await portalCreateZaloLinkToken();
      const copied = result.linkCode ? await copyText(result.linkCode) : false;

      setChannelFlows((current) => ({
        ...current,
        zalo: {
          status: result.status === "already_linked" ? "linked" : "linking",
          helperText: result.helperText,
          expiresAt: result.expiresAt,
          linkCode: result.linkCode,
          reused: result.reused,
          timedOut: false,
          startedAt: Date.now(),
        },
      }));

      setZaloGuideOpen(true);
      window.open(
        result.zaloUrl || siteConfig.zaloOaUrl,
        "_blank",
        "noopener,noreferrer",
      );
      toast.success(
        result.status === "already_linked"
          ? "Zalo đã liên kết sẵn. Bạn có thể mở OA và dùng chat ngay."
          : copied
            ? `Đã copy mã ${result.linkCode} và mở OA Calo Track.`
            : "Đã mở OA Calo Track. Hãy gửi mã liên kết một lần trong chat.",
      );
    } catch (error) {
      toast.error(
        String((error as Error)?.message || "Không thể tạo self-link Zalo."),
      );
    } finally {
      setZaloLoading(false);
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(249,115,22,0.08),_transparent_24%),linear-gradient(180deg,#f7fbfa_0%,#ffffff_46%,#f8fafc_100%)] px-4 py-6">
        <div className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center">
          <div className="rounded-[28px] border border-primary/10 bg-white/90 px-6 py-5 text-center shadow-sm">
            <div className="text-sm font-semibold text-foreground">
              Đang chuyển bạn tới màn đăng nhập…
            </div>
            <div className="mt-2 text-sm text-zinc-500">
              Portal sẽ mở lại dashboard ngay sau khi xác thực xong.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(249,115,22,0.08),_transparent_24%),linear-gradient(180deg,#f7fbfa_0%,#ffffff_46%,#f8fafc_100%)] px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-6">
        {snapshotError ? (
          <div className="rounded-[24px] border border-amber-200 bg-amber-50/90 px-5 py-4 text-sm text-amber-900 shadow-sm">
            <div className="font-semibold">
              Dashboard vẫn hoạt động ở chế độ an toàn.
            </div>
            <div className="mt-1">{snapshotError}</div>
            <div className="mt-2 text-amber-800/90">
              Bạn có thể bấm <strong>Làm mới portal snapshot</strong> hoặc đăng
              nhập lại để đồng bộ entitlement mới nhất.
            </div>
          </div>
        ) : null}

        {snapshot?.accessState === "blocked" ? (
          <div className="rounded-[24px] border border-red-200 bg-red-50/90 px-5 py-4 text-sm text-red-800 shadow-sm">
            <div className="font-semibold">Tài khoản này đang bị chặn.</div>
            <div className="mt-1">
              Portal chỉ hiển thị trạng thái hiện tại. Nếu cần mở lại truy cập,
              vui lòng liên hệ support.
            </div>
          </div>
        ) : null}

        {snapshot?.accessState === "pending_verification" ? (
          <div className="rounded-[24px] border border-primary/15 bg-primary/5 px-5 py-4 text-sm text-zinc-700 shadow-sm">
            <div className="font-semibold text-foreground">
              Bạn cần xác thực số điện thoại để mở đầy đủ dashboard.
            </div>
            <div className="mt-1">
              Session hiện tại vẫn còn, nhưng entitlement và linked channels chỉ
              được đồng bộ sau khi số điện thoại canonical hoàn tất.
            </div>
          </div>
        ) : null}

        {showTrialRenewalBanner ? (
          <div className="rounded-[24px] border border-emerald-200 bg-emerald-50/90 px-5 py-4 text-sm text-emerald-900 shadow-sm">
            <div className="font-semibold">
              Pro dùng thử 7 ngày sắp hết hạn.
            </div>
            <div className="mt-1">
              Bạn còn {trialDaysRemaining} ngày để giữ nguyên coach, ảnh AI và quota cao hơn. Nếu muốn tiếp tục không gián đoạn,
              hãy gia hạn ngay từ dashboard.
            </div>
            <div className="mt-3">
              <Button
                variant="outline"
                onClick={() => navigate(`${siteConfig.checkoutPath}?plan=pro`)}
              >
                Gia hạn Pro
              </Button>
            </div>
          </div>
        ) : null}

        <div className={SURFACE}>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
                Khu vực quản trị
              </div>
              <h1 className="bg-gradient-to-br from-zinc-800 to-zinc-500 bg-clip-text text-3xl font-semibold tracking-[-0.04em] text-transparent sm:text-4xl">
                Huấn luyện viên AI đồng bộ trên mọi nền tảng.
              </h1>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                CaloTrack Elite Coach sử dụng số điện thoại làm định danh duy
                nhất. Sau khi xác thực, lịch sử ăn uống, tiến độ giảm mỡ và
                quyền lợi Elite sẽ được đồng bộ tức thì trên web, Zalo và
                Telegram.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Button asChild>
                <a
                  href={getPrimaryChannelHref()}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Mở Zalo OA
                </a>
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate(`${siteConfig.checkoutPath}?plan=pro`)}
              >
                {getBillingCheckoutLabel("monthly")}
              </Button>
              <Button
                variant="ghost"
                onClick={async () => {
                  await supabase.auth.signOut();
                  navigate("/");
                }}
              >
                Đăng xuất
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          <div className={SUBSURFACE}>
            <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary opacity-10 blur-2xl transition-opacity group-hover:opacity-30" />
            <div className="relative">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
                Tài khoản
              </div>
              <div className="mt-3 text-xl font-semibold text-foreground">
                {accountLabel}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                {snapshot?.source === "customer_linked"
                  ? "Đã đồng bộ với dữ liệu huấn luyện chính thức."
                  : "Xác thực số điện thoại để bảo mật tài khoản."}
              </div>
            </div>
          </div>
          <div className={SUBSURFACE}>
            <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-accent opacity-10 blur-2xl transition-opacity group-hover:opacity-30" />
            <div className="relative">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
                Plan hiện tại
              </div>
              <div className="mt-3">
                <span
                  className={`rounded-full border px-3 py-1 text-sm font-semibold ${planTone(snapshot?.plan ?? "free")}`}
                >
                  {formatTierLabel(snapshot?.plan ?? "free")}
                </span>
              </div>
              <div className="mt-3 text-sm text-muted-foreground">
                {entitlementLabel}
              </div>
            </div>
          </div>
          <div className={SUBSURFACE}>
            <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-emerald-500 opacity-10 blur-2xl transition-opacity group-hover:opacity-30" />
            <div className="relative">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
                Quota hôm nay
              </div>
              <div className="mt-3 text-xl font-semibold text-foreground">
                {quotaLabel}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                Số lượt dùng AI được chia sẻ chung để bạn có thể chat bất cứ
                đâu.
              </div>
            </div>
          </div>
          <div className={SUBSURFACE}>
            <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-blue-500 opacity-10 blur-2xl transition-opacity group-hover:opacity-30" />
            <div className="relative">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
                Linked channels
              </div>
              <div className="mt-3 text-xl font-semibold text-foreground">
                {linkedChannelsCount}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                Khi web, Zalo và Telegram cùng kết nối, dữ liệu của bạn sẽ luôn
                nhất quán.
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <div className="space-y-6">
            <div className={SURFACE}>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <div className="text-sm font-semibold text-foreground">
                  Kênh đã link và trạng thái sử dụng
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {[
                  {
                    label: "Zalo",
                    helper:
                      channelSummaries.find((item) => item.channel === "zalo")
                        ?.helperText || "Nếu auto-link chưa xong, bạn có thể dùng self-link dự phòng từ dashboard.",
                    status:
                      channelSummaries.find((item) => item.channel === "zalo")
                        ?.statusLabel || "Chưa liên kết",
                  },
                  {
                    label: "Telegram",
                    helper:
                      channelSummaries.find(
                        (item) => item.channel === "telegram",
                      )?.helperText || "Sẵn sàng tự liên kết từ dashboard.",
                    status:
                      channelSummaries.find(
                        (item) => item.channel === "telegram",
                      )?.statusLabel || "Chưa liên kết",
                  },
                  {
                    helper:
                      "Nơi quản lý tập luyện, thanh toán và lịch sử dinh dưỡng.",
                    status: snapshot?.customerId
                      ? "Đã liên kết"
                      : "Đang provision",
                  },
                ].map((card) => (
                  <div
                    key={card.label}
                    className="rounded-2xl border border-white/60 bg-white/60 p-4 shadow-sm backdrop-blur-md transition-all hover:bg-white/80"
                  >
                    <div className="text-sm font-semibold text-foreground">
                      {card.label}
                    </div>
                    <div className="mt-1 text-sm text-primary">
                      {card.status}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-muted-foreground">
                      {card.helper}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <MacroTracker />

            <div className={SURFACE}>
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" />
                <div className="text-sm font-semibold text-foreground">
                  Lịch sử hóa đơn
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {loading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Đang tải payment summary...
                  </div>
                ) : snapshot?.payments.length ? (
                  snapshot.payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="rounded-2xl border border-white/60 bg-white/60 p-4 shadow-sm backdrop-blur-md transition-all hover:bg-white/80"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="font-semibold text-foreground">
                            {payment.billingSku || "Portal order"} •{" "}
                            {payment.amount.toLocaleString("vi-VN")}đ
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            {payment.provider ||
                              payment.paymentMethod ||
                              "payment"}{" "}
                            • {payment.status} • {formatDate(payment.createdAt)}
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {payment.transactionCode || "Chưa có mã giao dịch"}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-white/60 bg-white/60 p-4 text-sm text-muted-foreground shadow-sm backdrop-blur-md">
                    Bạn chưa có giao dịch trả phí nào, hoặc đang dùng Pro trial / Free linh hoạt.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className={SURFACE}>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
                Số điện thoại & phiên portal
              </div>
              <h2 className="mt-3 text-2xl font-semibold text-foreground">
                Xác thực qua Zalo
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Số điện thoại đã xác thực là khóa chung cho checkout, dashboard
                và entitlement trên chat. Nếu bạn cần đổi số hoặc relink
                account, hãy liên hệ support để tránh lệch quyền giữa web và các
                kênh chat.
              </p>
              <div className="mt-5 space-y-3 rounded-[24px] border border-white/40 bg-white/40 p-4 backdrop-blur-sm">
                <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                    Số điện thoại đã xác thực
                  </div>
                  <div className="mt-2 text-lg font-semibold text-foreground">
                    {phoneDraft ||
                      snapshot?.phoneDisplay ||
                      snapshot?.phoneE164 ||
                      "Chưa có"}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-muted-foreground">
                    Mọi hoạt động thanh toán và dữ liệu sẽ gắn liền với số điện
                    thoại này.
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={handleRefresh}
                  className="w-full"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Cập nhật dữ liệu từ hệ thống
                </Button>
              </div>
            </div>

            <div className={SURFACE}>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
                Kích hoạt kênh sử dụng
              </div>
              <h2 className="mt-3 text-2xl font-semibold text-foreground">
                Tự liên kết Zalo và Telegram
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Sau khi tài khoản đã được kích hoạt, bạn có thể tự kết nối từng
                kênh chat để bắt đầu tập luyện.
              </p>

              <div className="mt-5 grid gap-4">
                {channelSummaries.map((card) => {
                  const isTelegram = card.channel === "telegram";
                  const isBusy = isTelegram ? telegramLoading : zaloLoading;
                  const primaryAction = isTelegram
                    ? handleTelegramLink
                    : handleZaloLink;
                  const isLinked = card.status === "linked";
                  const showAlert = card.status === "needs_support";

                  return (
                    <div
                      key={card.channel}
                      className="rounded-[28px] border border-primary/10 bg-primary/5 p-5"
                    >
                      <div className="flex flex-col gap-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="text-lg font-semibold text-foreground">
                              {card.title}
                            </div>
                            <div className="mt-1 text-sm font-medium text-primary">
                              {card.statusLabel}
                            </div>
                            <div className="mt-2 text-sm leading-6 text-muted-foreground">
                              {card.helperText}
                            </div>
                          </div>
                          {showAlert ? (
                            <AlertTriangle className="mt-1 h-5 w-5 text-orange-500" />
                          ) : isLinked ? (
                            <CheckCircle2 className="mt-1 h-5 w-5 text-emerald-600" />
                          ) : (
                            <ShieldCheck className="mt-1 h-5 w-5 text-primary" />
                          )}
                        </div>

                        <div className="rounded-2xl border border-white/70 bg-white/80 p-4 text-sm text-muted-foreground">
                          {card.linkedDisplayName ? (
                            <div>
                              <div className="font-medium text-foreground">
                                Display name: {card.linkedDisplayName}
                              </div>
                              <div className="mt-1">
                                Linked lúc{" "}
                                {card.linkedAt
                                  ? formatDate(card.linkedAt)
                                  : "gần đây"}
                              </div>
                            </div>
                          ) : card.linkCode ? (
                            <div>
                              <div className="font-medium text-foreground">
                                Mã liên kết hiện tại: {card.linkCode}
                              </div>
                              <div className="mt-1">
                                Hết hạn lúc{" "}
                                {card.expiresAt
                                  ? formatShortDate(card.expiresAt)
                                  : "30 phút kể từ lúc tạo"}
                              </div>
                            </div>
                          ) : (
                            <div>
                              {isTelegram
                                ? "One-tap flow: bấm mở Telegram, bot sẽ consume token và dashboard tự cập nhật."
                                : "Hybrid self-link: tạo mã, gửi mã trong OA, rồi quay lại dashboard để hệ thống tự nhận."}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button
                            onClick={primaryAction}
                            disabled={isBusy}
                            className="sm:flex-1"
                          >
                            {isBusy ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : isLinked ? (
                              <ExternalLink className="mr-2 h-4 w-4" />
                            ) : (
                              <MessageCircle className="mr-2 h-4 w-4" />
                            )}
                            {isLinked
                              ? `Mở ${card.title}`
                              : isTelegram
                                ? "Mở Telegram và tự link"
                                : "Mở Zalo dự phòng"}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={handleRefresh}
                            className="sm:flex-1"
                          >
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Làm mới trạng thái
                          </Button>
                          {!isTelegram && card.linkCode ? (
                            <Button
                              variant="outline"
                              onClick={async () => {
                                const copied = await copyText(
                                  card.linkCode || "",
                                );
                                if (copied) {
                                  toast.success(`Đã copy mã ${card.linkCode}.`);
                                } else {
                                  toast.error(
                                    "Không thể copy mã liên kết trên thiết bị này.",
                                  );
                                }
                              }}
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              Copy mã
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <Dialog open={zaloGuideOpen} onOpenChange={setZaloGuideOpen}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Kết nối Zalo dự phòng vào hồ sơ huấn luyện</DialogTitle>
              <DialogDescription>
                Chỉ cần gửi mã vào OA, hệ thống sẽ tự động nhận diện và kết nối
                với tài khoản của bạn.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-2xl border border-primary/10 bg-primary/5 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
                  Mã liên kết
                </div>
                <div className="mt-2 text-3xl font-semibold tracking-[0.18em] text-foreground">
                  {channelFlows.zalo.linkCode || "Đang tạo mã..."}
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  Hết hạn lúc {formatShortDate(channelFlows.zalo.expiresAt)}
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
                <div>
                  <span className="font-semibold text-foreground">Bước 1:</span>{" "}
                  Bấm mở OA Calo Track.
                </div>
                <div>
                  <span className="font-semibold text-foreground">Bước 2:</span>{" "}
                  Gửi đúng mã phía trên vào chat Zalo, ví dụ{" "}
                  <span className="font-medium text-foreground">
                    /link {channelFlows.zalo.linkCode || "AB12CD34"}
                  </span>
                  .
                </div>
                <div>
                  <span className="font-semibold text-foreground">Bước 3:</span>{" "}
                  Quay lại dashboard. Hệ thống sẽ tự polling và chuyển trạng
                  thái sang{" "}
                  <span className="font-medium text-foreground">
                    Đã liên kết
                  </span>
                  .
                </div>
              </div>

              {channelFlows.zalo.helperText ? (
                <div className="rounded-2xl border border-primary/10 bg-primary/5 p-4 text-sm text-muted-foreground">
                  {channelFlows.zalo.helperText}
                </div>
              ) : null}
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  const copied = await copyText(
                    channelFlows.zalo.linkCode || "",
                  );
                  if (copied) {
                    toast.success(`Đã copy mã ${channelFlows.zalo.linkCode}.`);
                  } else {
                    toast.error(
                      "Không thể copy mã liên kết trên thiết bị này.",
                    );
                  }
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy mã
              </Button>
              <Button variant="outline" onClick={handleRefresh}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Làm mới trạng thái
              </Button>
              <Button asChild>
                <a
                  href={siteConfig.zaloOaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Mở OA Calo Track
                </a>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
