import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getDashboardSummaryMock,
  buildLinkRequiredTextCleanMock,
  handleDirectExerciseLogMock,
  handleDirectFoodLogMock,
  handleDirectGoalModeMock,
  persistPendingIntentMock,
  resolveZaloGatewayAccessMock,
  upsertCoreProfileForContextMock,
} = vi.hoisted(() => ({
  getDashboardSummaryMock: vi.fn(),
  buildLinkRequiredTextCleanMock: vi.fn(),
  handleDirectExerciseLogMock: vi.fn(),
  handleDirectFoodLogMock: vi.fn(),
  handleDirectGoalModeMock: vi.fn(),
  persistPendingIntentMock: vi.fn(),
  resolveZaloGatewayAccessMock: vi.fn(),
  upsertCoreProfileForContextMock: vi.fn(),
}));

vi.mock("../dashboardSummaryServer.js", () => ({
  getDashboardSummary: getDashboardSummaryMock,
}));

vi.mock("../zaloGatewayChatServer.js", () => ({
  buildLinkRequiredTextClean: buildLinkRequiredTextCleanMock,
  handleDirectExerciseLog: handleDirectExerciseLogMock,
  handleDirectFoodLog: handleDirectFoodLogMock,
  handleDirectGoalMode: handleDirectGoalModeMock,
  normalizeCommandText: (value: unknown) => String(value ?? "").trim().toLowerCase(),
  normalizePendingIntentState: (value: unknown) => {
    if (!value || typeof value !== "object") return {};
    return { ...(value as Record<string, unknown>) };
  },
  persistPendingIntent: persistPendingIntentMock,
  resolveZaloGatewayAccess: resolveZaloGatewayAccessMock,
}));

vi.mock("../handlers/portal.js", () => ({
  upsertCoreProfileForContext: upsertCoreProfileForContextMock,
}));

import { dispatchInboundEnvelope } from "./dispatch.js";

function makeInboundEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    channel: "zalo",
    channel_message_id: "msg-1",
    received_at: new Date().toISOString(),
    sender: {
      channel_user_id: "zalo-user-1",
      customer_id: "42",
      display_name: "Tester",
      locale: "vi",
    },
    message: {
      kind: "text",
      text: "hi",
      text_raw: "hi",
      attachments: [],
      button_payload: null,
    },
    context: {
      conversation_state: null,
      pending_intent: null,
      last_assistant_message_at: null,
    },
    trace: {
      request_id: "req-1",
      ingress_latency_ms: 10,
    },
    ...overrides,
  };
}

describe("dispatchInboundEnvelope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDashboardSummaryMock.mockResolvedValue({
      daily: {
        intakeKcal: 1200,
        exerciseKcal: 200,
        netKcal: 1000,
        goalKcal: 1800,
        consumedProteinG: 90,
        consumedCarbsG: 120,
        consumedFatG: 35,
      },
      weekly: {
        consumedKcal: 9000,
        targetKcal: 12600,
        remainingKcal: 3600,
        consumedProteinG: 700,
        consumedCarbsG: 950,
        consumedFatG: 310,
        daysLogged: 6,
      },
    });
    buildLinkRequiredTextCleanMock.mockResolvedValue("LINK REQUIRED");
    handleDirectExerciseLogMock.mockResolvedValue({ handled: false });
    handleDirectFoodLogMock.mockResolvedValue({ handled: false });
    handleDirectGoalModeMock.mockResolvedValue({ handled: false });
    persistPendingIntentMock.mockResolvedValue(undefined);
    resolveZaloGatewayAccessMock.mockResolvedValue(null);
    upsertCoreProfileForContextMock.mockResolvedValue({
      tdee: 2200,
      daily_calorie_goal: 1800,
    });
  });

  it("fails safely when save-confirm arrives without a fresh confirm candidate", async () => {
    const result = await dispatchInboundEnvelope(
      makeInboundEnvelope({
        message: {
          kind: "text",
          text: "luu mon nay",
          text_raw: "lưu món này",
          attachments: [],
          button_payload: null,
        },
      }),
    );

    expect(result.trace.route).toBe("direct");
    expect(result.reply.kind).toBe("text");
    expect(result.reply.text).toBeTruthy();
    expect(result.state_patch).toEqual({
      pending_intent: {},
    });
  });

  it("routes image messages to the workflow lane with a pre-ack", async () => {
    const result = await dispatchInboundEnvelope(
      makeInboundEnvelope({
        message: {
          kind: "image",
          text: null,
          text_raw: null,
          attachments: [{ kind: "image", storage_url: "https://example.com/meal.jpg", original_url: "https://example.com/meal.jpg", platform_file_id: null, mime_type: "image/jpeg", size_bytes: null, width: null, height: null, metadata: null }],
          button_payload: null,
        },
      }),
    );

    expect(result.trace.route).toBe("llm");
    expect(result.reply.text).toBeTruthy();
  });

  it("returns a direct greeting without needing DB access", async () => {
    const result = await dispatchInboundEnvelope(
      makeInboundEnvelope({
        message: {
          kind: "text",
          text: "hi",
          text_raw: "Hi",
          attachments: [],
          button_payload: null,
        },
      }),
    );

    expect(result.trace.route).toBe("direct");
    expect(result.reply.text).toContain("online");
  });

  it("renders a direct daily summary for linked Zalo users", async () => {
    resolveZaloGatewayAccessMock.mockResolvedValue({
      linked: true,
      customerId: "42",
      linkedUserId: "7",
      senderUserRow: { id: 7 },
      context: { customerId: "42", linkedUserId: "7", userRow: { id: 7 }, customerRow: { id: 42 } },
    });

    const result = await dispatchInboundEnvelope(
      makeInboundEnvelope({
        message: {
          kind: "text",
          text: "/daily",
          text_raw: "/daily",
          attachments: [],
          button_payload: null,
        },
      }),
      { admin: {} },
    );

    expect(result.trace.route).toBe("direct");
    expect(result.reply.text).toContain("Dashboard");
    expect(getDashboardSummaryMock).toHaveBeenCalledWith({}, expect.anything(), "day");
  });
});
