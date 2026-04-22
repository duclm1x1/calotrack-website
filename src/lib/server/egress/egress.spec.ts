import { describe, expect, it } from "vitest";

import { renderTelegramOutboundPayload, sendTelegramOutboundEnvelope } from "./telegram.js";
import { renderZaloOutboundPayload } from "./zalo.js";

const baseEnvelope = {
  channel: "zalo" as const,
  recipient: {
    channel_user_id: "user-1",
    customer_id: "42",
  },
  reply: {
    kind: "text" as const,
    text: "Xin chao",
    rich: null,
    quick_actions: [
      { id: "a1", label: "Luu mon nay", payload: "save:1", style: "primary" as const },
      { id: "a2", label: "Bo qua", payload: "skip:1", style: "secondary" as const },
    ],
    formatting_hints: null,
  },
  state_patch: {},
  trace: {
    route: "direct" as const,
    total_latency_ms: 120,
  },
};

describe("egress adapters", () => {
  it("renders Zalo quick replies from the channel-neutral outbound envelope", () => {
    const payload = renderZaloOutboundPayload(baseEnvelope);

    expect(payload).toEqual({
      recipient: {
        user_id: "user-1",
      },
      message: {
        text: "Xin chao",
        quick_replies: [
          { content: "Luu mon nay", payload: "save:1" },
          { content: "Bo qua", payload: "skip:1" },
        ],
      },
    });
  });

  it("renders Telegram inline keyboards from the same quick action structure", () => {
    const payload = renderTelegramOutboundPayload({
      ...baseEnvelope,
      channel: "telegram",
    });

    expect(payload).toEqual({
      chat_id: "user-1",
      text: "Xin chao",
      reply_markup: {
        inline_keyboard: [
          [{ text: "Luu mon nay", callback_data: "save:1" }],
          [{ text: "Bo qua", callback_data: "skip:1" }],
        ],
      },
    });
  });

  it("falls back to render-only Telegram responses when no bot token is configured", async () => {
    const originalToken = process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;

    try {
      const result = await sendTelegramOutboundEnvelope({
        ...baseEnvelope,
        channel: "telegram",
      });

      expect(result).toMatchObject({
        accepted: false,
        reason: "telegram_not_configured",
        render_only: true,
      });
      expect(result.payload).toMatchObject({
        chat_id: "user-1",
        text: "Xin chao",
      });
    } finally {
      if (originalToken === undefined) {
        delete process.env.TELEGRAM_BOT_TOKEN;
      } else {
        process.env.TELEGRAM_BOT_TOKEN = originalToken;
      }
    }
  });
});
