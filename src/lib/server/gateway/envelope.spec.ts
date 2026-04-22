import { describe, expect, it, vi } from "vitest";

vi.mock("../zaloGatewayChatServer.js", () => ({
  normalizeCommandText: (value: unknown) => String(value ?? "").trim().toLowerCase(),
}));

import { buildTelegramInboundEnvelope } from "../ingress/telegram.js";
import { buildZaloInboundEnvelope } from "../ingress/zalo.js";

describe("gateway envelope adapters", () => {
  it("normalizes a Zalo text payload into the canonical inbound envelope", () => {
    const envelope = buildZaloInboundEnvelope(
      {
        sender: { id: "zalo-user-1", name: "Nguyen Van A" },
        message: {
          msg_id: "zalo-msg-1",
          text: "  /Daily  ",
        },
      },
      {
        requestId: "req-zalo-1",
        startedAtMs: Date.now() - 25,
      },
    );

    expect(envelope.channel).toBe("zalo");
    expect(envelope.channel_message_id).toBe("zalo-msg-1");
    expect(envelope.sender.channel_user_id).toBe("zalo-user-1");
    expect(envelope.message.kind).toBe("text");
    expect(envelope.message.text).toBe("/daily");
    expect(envelope.message.text_raw).toBe("/Daily");
    expect(envelope.trace.request_id).toBe("req-zalo-1");
    expect(envelope.trace.ingress_latency_ms).toBeGreaterThanOrEqual(0);
  });

  it("normalizes a Telegram callback payload into a button envelope", () => {
    const envelope = buildTelegramInboundEnvelope(
      {
        callback_query: {
          id: "cb-1",
          data: "save:meal:1",
          from: {
            id: 12345,
            first_name: "Tele",
            last_name: "Gram",
          },
        },
      },
      {
        requestId: "req-tg-1",
      },
    );

    expect(envelope.channel).toBe("telegram");
    expect(envelope.channel_message_id).toBe("cb-1");
    expect(envelope.sender.channel_user_id).toBe("12345");
    expect(envelope.sender.display_name).toBe("Tele Gram");
    expect(envelope.message.kind).toBe("button");
    expect(envelope.message.text).toBe("save:meal:1");
    expect(envelope.message.button_payload).toBe("save:meal:1");
  });
});
