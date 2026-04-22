import * as crypto from "node:crypto";

function safeString(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function cleanEnv(value: unknown) {
  return safeString(value).replace(/\\r\\n/g, "").replace(/\\n/g, "").replace(/\r?\n/g, "");
}

function getSiteUrl() {
  return cleanEnv(process.env.CANARY_SITE_URL || process.env.SITE_URL || "https://calotrack.pro").replace(/\/+$/, "");
}

export function getZaloMediaProxySecret() {
  return cleanEnv(
    process.env.CALOTRACK_IMAGE_PROXY_SECRET ||
      process.env.ZALO_OA_INTERNAL_KEY ||
      process.env.CHANNEL_CONTEXT_INTERNAL_KEY ||
      process.env.CALOTRACK_ZALO_INTERNAL_SECRET,
  );
}

function createSignature(secret: string, sourceUrl: string, expiresAtMs: number) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${expiresAtMs}:${sourceUrl}`)
    .digest("hex");
}

export function isAlreadyProxiedMediaUrl(value: unknown) {
  const raw = safeString(value);
  return raw.includes("/api/zalo-media-proxy");
}

export function isAllowedZaloMediaUrl(value: unknown) {
  const raw = safeString(value);
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    const hostname = parsed.hostname.toLowerCase();
    return hostname.endsWith(".zdn.vn") || hostname.endsWith(".zalo.me") || hostname.endsWith(".zadn.vn");
  } catch {
    return false;
  }
}

export function buildSignedZaloMediaProxyUrl(sourceUrl: unknown, options: { siteUrl?: string; expiresAtMs?: number } = {}) {
  const rawSourceUrl = safeString(sourceUrl);
  if (!rawSourceUrl || isAlreadyProxiedMediaUrl(rawSourceUrl) || !isAllowedZaloMediaUrl(rawSourceUrl)) {
    return rawSourceUrl || null;
  }

  const secret = getZaloMediaProxySecret();
  if (!secret) return rawSourceUrl;

  const expiresAtMs = Number.isFinite(Number(options.expiresAtMs))
    ? Number(options.expiresAtMs)
    : Date.now() + 10 * 60 * 1000;
  const baseUrl = options.siteUrl || getSiteUrl();
  const target = new URL("/api/zalo-media-proxy", baseUrl);
  target.searchParams.set("src", rawSourceUrl);
  target.searchParams.set("exp", String(expiresAtMs));
  target.searchParams.set("sig", createSignature(secret, rawSourceUrl, expiresAtMs));
  return target.toString();
}

export function verifySignedZaloMediaProxyParams(sourceUrl: unknown, expiresAt: unknown, signature: unknown) {
  const rawSourceUrl = safeString(sourceUrl);
  const rawSignature = safeString(signature).toLowerCase();
  const expiresAtMs = Number.parseInt(safeString(expiresAt), 10);
  if (!rawSourceUrl || !rawSignature || !Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    return false;
  }

  const secret = getZaloMediaProxySecret();
  if (!secret || !isAllowedZaloMediaUrl(rawSourceUrl)) return false;

  const expected = createSignature(secret, rawSourceUrl, expiresAtMs);
  try {
    return crypto.timingSafeEqual(Buffer.from(rawSignature, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

function rewriteAttachmentPayload(payload: Record<string, unknown>, siteUrl: string) {
  const nextPayload = { ...payload };
  for (const key of ["url", "href", "thumbnail", "src"]) {
    if (key in nextPayload) {
      const proxied = buildSignedZaloMediaProxyUrl(nextPayload[key], { siteUrl });
      if (proxied) nextPayload[key] = proxied;
    }
  }
  return nextPayload;
}

export function rewriteZaloBodyMediaUrls<T extends Record<string, any>>(body: T, options: { siteUrl?: string } = {}): T {
  const siteUrl = options.siteUrl || getSiteUrl();
  const cloned = JSON.parse(JSON.stringify(body || {}));

  for (const key of ["image_url", "media_url"]) {
    if (key in cloned) {
      const proxied = buildSignedZaloMediaProxyUrl(cloned[key], { siteUrl });
      if (proxied) cloned[key] = proxied;
    }
  }

  if (cloned.message && typeof cloned.message === "object") {
    for (const key of ["image_url", "media_url"]) {
      if (key in cloned.message) {
        const proxied = buildSignedZaloMediaProxyUrl(cloned.message[key], { siteUrl });
        if (proxied) cloned.message[key] = proxied;
      }
    }

    if (Array.isArray(cloned.message.attachments)) {
      cloned.message.attachments = cloned.message.attachments.map((attachment: Record<string, unknown>) => {
        if (!attachment || typeof attachment !== "object") return attachment;
        const nextAttachment = { ...attachment };
        if (nextAttachment.payload && typeof nextAttachment.payload === "object") {
          nextAttachment.payload = rewriteAttachmentPayload(nextAttachment.payload as Record<string, unknown>, siteUrl);
        }
        return nextAttachment;
      });
    }
  }

  return cloned;
}
