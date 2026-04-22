import { getDashboardSummary } from "../dashboardSummaryServer.js";
import {
  buildLinkRequiredTextClean,
  handleDirectExerciseLog,
  handleDirectFoodLog,
  handleDirectGoalMode,
  normalizeCommandText,
  persistPendingIntent,
  resolveZaloGatewayAccess,
} from "../zaloGatewayChatServer.js";
import { upsertCoreProfileForContext } from "../handlers/portal.js";
import { InboundEnvelopeSchema, OutboundEnvelopeSchema, type InboundEnvelope, type OutboundEnvelope } from "./envelope.js";
import { clearConfirmCandidate, isConfirmCandidateFresh, readEnvelopePendingIntent } from "./state.js";

type DispatchDependencies = {
  admin?: any;
  now?: () => Date;
};

function safeString(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function formatIntVi(value: number | null | undefined) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? Math.round(numeric).toLocaleString("vi-VN") : "0";
}

function formatFloatVi(value: number | null | undefined, digits = 1) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return "0";
  return numeric.toLocaleString("vi-VN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function buildGreetingText() {
  return [
    "Hey. Minh dang online day.",
    "Ban co the gui mon vua an, gui anh bua an, hoac hoi thang ve calories, protein, tap luyen va recovery.",
    "",
    "1. Ghi mon an moi",
    "2. Xem chi tiet thong ke",
    "3. Cap nhat can nang",
    "4. Xem tien do tuan",
    "5. Nhan loi khuyen",
    "",
    "Meo nhanh: dung /daily, /weekly hoac /help.",
  ].join("\n");
}

function buildHelpText() {
  return [
    "[Help] Lenh nhanh CaloTrack",
    "",
    "Theo doi nhanh",
    "- /stats",
    "- /daily",
    "- /homnay",
    "- /tuannay",
    "- /thangnay",
    "",
    "Ghi log",
    "- /log <noi dung>",
    "- /ghi <noi dung>",
    "- /clear",
    "",
    "Ho so",
    "- /onboarding",
    "- /onboarding reset",
    "- /mode ...",
    "- /can 72.4",
    "",
    "Gym mode",
    "- /gym",
    "- /gym off",
  ].join("\n");
}

function buildDailySummaryText(summary: Record<string, any>) {
  const daily = (summary?.daily || {}) as Record<string, any>;
  return [
    "Dashboard hom nay",
    `- Nap vao: ${formatIntVi(daily.intakeKcal)} kcal`,
    `- Tap luyen: ${formatIntVi(daily.exerciseKcal)} kcal`,
    `- Net: ${formatIntVi(daily.netKcal)} / Goal ${formatIntVi(daily.goalKcal)} kcal`,
    `- Macro: P ${formatFloatVi(daily.consumedProteinG)}g | C ${formatFloatVi(daily.consumedCarbsG)}g | F ${formatFloatVi(daily.consumedFatG)}g`,
  ].join("\n");
}

function buildWeeklySummaryText(summary: Record<string, any>) {
  const weekly = (summary?.weekly || {}) as Record<string, any>;
  return [
    "Dashboard 7 ngay gan nhat",
    `- Da nap: ${formatIntVi(weekly.consumedKcal)} / ${formatIntVi(weekly.targetKcal)} kcal`,
    `- Con lai: ${formatIntVi(weekly.remainingKcal)} kcal`,
    `- Macro: P ${formatFloatVi(weekly.consumedProteinG)}g | C ${formatFloatVi(weekly.consumedCarbsG)}g | F ${formatFloatVi(weekly.consumedFatG)}g`,
    `- So ngay da log: ${formatIntVi(weekly.daysLogged)}`,
  ].join("\n");
}

function buildWorkflowPreAckText(normalized: string, hasAttachment: boolean) {
  if (hasAttachment) return "Minh dang phan tich anh, ban doi minh chut nhe.";
  if (/^(?:\/)?(?:log|ghi)\b/.test(normalized)) return "Minh dang ghi vao nhat ky cho ban.";
  if (/^(?:\/)?(daily|homnay|stats)$/.test(normalized)) return "Minh dang lay dashboard hom nay cho ban.";
  if (/^(?:\/)?(tuannay|weekly|thangnay|monthly)$/.test(normalized)) return "Minh dang tong hop dashboard cho ban.";
  if (/(?:^|\s)(?:nuoc|uong|water)(?:\s|$)/.test(normalized)) return "Minh dang ghi log nuoc cho ban.";
  if (/\b(bao nhieu|calo|kcal|protein|carb|fat|macro|tra cuu|tim mon)\b/.test(normalized)) return "Minh dang tra cuu cho ban.";
  if (/\b(tu van|giai thich|co on khong|nen an|nen tap|co tot khong)\b/.test(normalized)) return "Minh dang phan tich cho ban.";
  return "Minh dang xu ly yeu cau cua ban.";
}

function isSaveConfirmPhrase(normalized: string) {
  return Boolean(
    /^(co|ok|oke|okay|yes|y|uh|um|duoc|dc|dong y|xac nhan)$/.test(normalized) ||
      /^(them vao nhat ky|ghi vao nhat ky|luu vao nhat ky|luu lai|ghi lai|log mon nay|them mon nay|luu mon nay|xac nhan ghi|xac nhan luu)$/.test(normalized) ||
      /^(toi )?(muon)\s+(ghi|luu|them).*(nhat ky|mon nay)$/.test(normalized)
  );
}

function readGymModeState(pendingIntent: Record<string, unknown>, nowMs: number) {
  const gymMode = pendingIntent.gym_mode;
  if (!gymMode || typeof gymMode !== "object") {
    return { enabled: false, remainingMinutes: 0, expiresAt: null };
  }
  const expiresAt = safeString((gymMode as Record<string, unknown>).expires_at) || null;
  const expiresAtMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
    return { enabled: false, remainingMinutes: 0, expiresAt };
  }
  return {
    enabled: true,
    remainingMinutes: Math.max(0, Math.ceil((expiresAtMs - nowMs) / 60000)),
    expiresAt,
  };
}

function makeOutboundEnvelope(
  inbound: InboundEnvelope,
  params: {
    text: string | null;
    route: "direct" | "dispatch" | "llm";
    statePatch?: Record<string, unknown>;
  },
  startedAt: number,
): OutboundEnvelope {
  return OutboundEnvelopeSchema.parse({
    channel: inbound.channel,
    recipient: {
      channel_user_id: inbound.sender.channel_user_id,
      customer_id: inbound.sender.customer_id,
    },
    reply: {
      kind: params.text ? "text" : "noop",
      text: params.text,
      rich: null,
      quick_actions: null,
      formatting_hints: null,
    },
    state_patch: params.statePatch || {},
    trace: {
      route: params.route,
      total_latency_ms: Math.max(0, Date.now() - startedAt),
    },
  });
}

export async function dispatchInboundEnvelope(input: unknown, deps: DispatchDependencies = {}) {
  const startedAt = Date.now();
  const inbound = InboundEnvelopeSchema.parse(input);
  const normalized = safeString(inbound.message.text) || normalizeCommandText(inbound.message.text_raw || "");
  const pendingIntent = readEnvelopePendingIntent(inbound);
  const nowMs = (deps.now || (() => new Date()))().getTime();

  if (inbound.message.kind !== "text" && inbound.message.kind !== "button") {
    return makeOutboundEnvelope(
      inbound,
      {
        text: buildWorkflowPreAckText(normalized, inbound.message.attachments.length > 0),
        route: "llm",
      },
      startedAt,
    );
  }

  if (isSaveConfirmPhrase(normalized) && !isConfirmCandidateFresh(pendingIntent, nowMs)) {
    return makeOutboundEnvelope(
      inbound,
      {
        text: "Minh chua co mon nao de luu. Ban vui long nhan /log <ten mon> de ghi thu cong nhe.",
        route: "direct",
        statePatch: {
          pending_intent: clearConfirmCandidate(pendingIntent),
        },
      },
      startedAt,
    );
  }

  if (/^(hi|hello|hey|xin chao|chao)$/.test(normalized)) {
    return makeOutboundEnvelope(inbound, { text: buildGreetingText(), route: "direct" }, startedAt);
  }

  if (/^(\/)?(help|menu)$/.test(normalized)) {
    return makeOutboundEnvelope(inbound, { text: buildHelpText(), route: "direct" }, startedAt);
  }

  const admin = deps.admin;
  const canResolveZalo = inbound.channel === "zalo" && admin;
  const access = canResolveZalo ? await resolveZaloGatewayAccess(admin, inbound.sender.channel_user_id) : null;

  if (access && !access.linked) {
    return makeOutboundEnvelope(
      inbound,
      {
        text: await buildLinkRequiredTextClean(admin, access),
        route: "direct",
      },
      startedAt,
    );
  }

  if (access?.context && /^(?:\/)?(daily|homnay|stats)$/.test(normalized)) {
    const summary = await getDashboardSummary(admin, access.context, "day");
    return makeOutboundEnvelope(
      inbound,
      { text: buildDailySummaryText(summary as Record<string, any>), route: "direct" },
      startedAt,
    );
  }

  if (access?.context && /^(?:\/)?(tuannay|weekly)$/.test(normalized)) {
    const summary = await getDashboardSummary(admin, access.context, "week");
    return makeOutboundEnvelope(
      inbound,
      { text: buildWeeklySummaryText(summary as Record<string, any>), route: "direct" },
      startedAt,
    );
  }

  if (access && /^(?:\/)?can\s+\d/.test(normalized)) {
    const match = safeString(inbound.message.text_raw).match(/^\/?can\s+(\d{2,3}(?:[.,]\d)?)(?:\s*kg)?$/i);
    const weightKg = match ? Number.parseFloat(match[1].replace(",", ".")) : Number.NaN;
    if (Number.isFinite(weightKg) && weightKg >= 20 && weightKg <= 400) {
      const result = await upsertCoreProfileForContext({
        admin,
        context: access.context || {
          customerId: access.customerId,
          linkedUserId: access.linkedUserId,
          userRow: access.senderUserRow,
          customerRow: null,
        },
        input: { weight_kg: weightKg },
        phoneE164: access.phoneE164,
      });
      const lines = [`Da cap nhat can nang: ${weightKg.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} kg.`];
      if (Number.isFinite(Number(result.tdee))) lines.push(`- TDEE: ${formatIntVi(Number(result.tdee))} kcal`);
      if (Number.isFinite(Number(result.daily_calorie_goal))) {
        lines.push(`- Muc tieu ngay: ${formatIntVi(Number(result.daily_calorie_goal))} kcal`);
      }
      return makeOutboundEnvelope(inbound, { text: lines.join("\n"), route: "direct" }, startedAt);
    }
  }

  if (access && /^(?:\/)?gym(?:\s+status)?$/.test(normalized)) {
    const gymState = readGymModeState(pendingIntent, nowMs);
    return makeOutboundEnvelope(
      inbound,
      {
        text: gymState.enabled
          ? `Gym mode dang bat. Con ${gymState.remainingMinutes} phut.`
          : "Gym mode dang tat. Dung /gym on de bat.",
        route: "direct",
      },
      startedAt,
    );
  }

  if (access && /^(?:\/)?gym(?:\s+(?:off|finish|done|xong|tat|dung|ket thuc))$/.test(normalized)) {
    const nextPendingIntent = { ...pendingIntent };
    delete nextPendingIntent.gym_mode;
    await persistPendingIntent(admin, access.context?.userRow || access.senderUserRow || null, nextPendingIntent);
    return makeOutboundEnvelope(
      inbound,
      {
        text: "Da tat gym mode. Khi can bat lai, nhan /gym on.",
        route: "direct",
        statePatch: { pending_intent: nextPendingIntent },
      },
      startedAt,
    );
  }

  if (access && /^(\/)?(log|ghi)\b/.test(normalized)) {
    const result = await handleDirectFoodLog(admin, access, inbound.message.text_raw || inbound.message.text || "", inbound.channel_message_id);
    if (result?.handled) {
      return makeOutboundEnvelope(
        inbound,
        {
          text: safeString(result.replyText) || null,
          route: "direct",
        },
        startedAt,
      );
    }
  }

  if (access) {
    const exerciseResult = await handleDirectExerciseLog(admin, access, inbound.message.text_raw || inbound.message.text || "");
    if (exerciseResult?.handled) {
      return makeOutboundEnvelope(
        inbound,
        {
          text: safeString(exerciseResult.replyText) || null,
          route: "direct",
        },
        startedAt,
      );
    }
    const goalModeResult = await handleDirectGoalMode(admin, access, inbound.message.text_raw || inbound.message.text || "");
    if (goalModeResult?.handled) {
      return makeOutboundEnvelope(
        inbound,
        {
          text: safeString(goalModeResult.replyText || goalModeResult.legacyReplyText) || null,
          route: "direct",
        },
        startedAt,
      );
    }
  }

  return makeOutboundEnvelope(
    inbound,
    {
      text: buildWorkflowPreAckText(normalized, inbound.message.attachments.length > 0),
      route: "llm",
    },
    startedAt,
  );
}
