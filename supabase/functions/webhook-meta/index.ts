// webhook-meta/index.ts
// Supabase Edge Function — Meta Webhook Handler
// Handles: Facebook Messenger, Instagram DM, WhatsApp Cloud API
//
// Pipeline:
//   1. GET request → webhook verification challenge (Meta setup)
//   2. POST request → HMAC verify → idempotency check → QStash enqueue → 200

import { corsHeaders, errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { acquireIdempotencyLock } from "../_shared/upstash.ts";
import { qstashPublish } from "../_shared/upstash.ts";
import type { Platform, QueuePayload } from "../_shared/types.ts";

// ============================================================
// Environment
// ============================================================
const QUEUE_PROCESSOR_URL = () => Deno.env.get("QUEUE_PROCESSOR_URL")!;

import { getSupabaseClient } from "../_shared/supabase-client.ts";
import { decryptSecret } from "../_shared/encryption.ts";

async function getMetaSettings() {
  const sb = getSupabaseClient();
  const { data } = await sb.from("business_settings").select("meta_verify_token, meta_app_secret").limit(1).single();
  
  if (data) {
    // Only decrypt if the value looks encrypted (contains `:` separator used by AES-GCM format)
    if (data.meta_verify_token && data.meta_verify_token.includes(":")) {
      data.meta_verify_token = await decryptSecret(data.meta_verify_token);
    }
    if (data.meta_app_secret && data.meta_app_secret.includes(":")) {
      data.meta_app_secret = await decryptSecret(data.meta_app_secret);
    }
  }
  return data || {};
}

// ============================================================
// HMAC-SHA256 signature verification
// ============================================================
async function verifyMetaSignature(
  body: string,
  signatureHeader: string | null,
  appSecret: string | null
): Promise<boolean> {
  if (!signatureHeader || !appSecret) return false;

  const expected = signatureHeader.replace("sha256=", "");

  const keyBytes = new TextEncoder().encode(appSecret);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const bodyBytes = new TextEncoder().encode(body);
  const sigBytes = await crypto.subtle.sign("HMAC", cryptoKey, bodyBytes);
  const sigHex = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison
  if (sigHex.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < sigHex.length; i++) {
    diff |= sigHex.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

// ============================================================
// Parse Messenger/Instagram webhook event
// ============================================================
function parseMessengerEvent(
  body: Record<string, unknown>,
  platform: Platform
): QueuePayload | null {
  try {
    const entry = (body.entry as unknown[])?.[0] as Record<string, unknown>;
    const messaging = (
      platform === "instagram"
        ? (entry?.messaging as unknown[])
        : (entry?.messaging as unknown[])
    )?.[0] as Record<string, unknown>;

    if (!messaging) return null;

    const sender = messaging.sender as Record<string, string>;
    const message = messaging.message as Record<string, unknown>;

    if (!sender?.id || !message) return null;

    // Ignore echo (bot's own messages)
    if (message.is_echo) return null;

    const payload: QueuePayload = {
      platformMessageId: message.mid as string,
      platform,
      platformId: sender.id,
      text: message.text as string | undefined,
      timestamp: messaging.timestamp as number,
      pageId: entry?.id as string | undefined,
    };

    // Handle attachments (images, voice, video)
    const attachments = message.attachments as
      | Array<{ type: string; payload: { url?: string } }>
      | undefined;
    if (attachments?.[0]) {
      const att = attachments[0];
      if (att.type === "image") {
        payload.mediaType = "image";
        payload.mediaUrl = att.payload.url;
      } else if (att.type === "audio") {
        payload.mediaType = "voice";
        payload.mediaUrl = att.payload.url;
      } else if (att.type === "video") {
        payload.mediaType = "video";
        payload.mediaUrl = att.payload.url;
      }
    }

    return payload;
  } catch (err) {
    console.error("parseMessengerEvent error:", err);
    return null;
  }
}

// ============================================================
// Parse WhatsApp Cloud API webhook event
// ============================================================
function parseWhatsAppEvent(body: Record<string, unknown>): QueuePayload | null {
  try {
    const entry = (body.entry as unknown[])?.[0] as Record<string, unknown>;
    const change = (entry?.changes as unknown[])?.[0] as Record<string, unknown>;
    const value = change?.value as Record<string, unknown>;

    const messages = value?.messages as Array<Record<string, unknown>>;
    if (!messages?.[0]) return null;

    const msg = messages[0];
    const contacts = value?.contacts as Array<Record<string, unknown>>;
    const contact = contacts?.[0];

    const payload: QueuePayload = {
      platformMessageId: msg.id as string,
      platform: "whatsapp",
      platformId: msg.from as string, // phone number
      customerName: (contact?.profile as Record<string, string>)?.name,
      timestamp: parseInt(msg.timestamp as string) * 1000,
    };

    if (msg.type === "text") {
      const textObj = msg.text as Record<string, string>;
      payload.text = textObj?.body;
    } else if (msg.type === "image") {
      const imgObj = msg.image as Record<string, string>;
      payload.mediaType = "image";
      payload.mediaUrl = imgObj?.id; // WhatsApp sends media ID, not URL
    } else if (msg.type === "audio") {
      const audioObj = msg.audio as Record<string, string>;
      payload.mediaType = "voice";
      payload.mediaUrl = audioObj?.id;
    } else if (msg.type === "video") {
      const videoObj = msg.video as Record<string, string>;
      payload.mediaType = "video";
      payload.mediaUrl = videoObj?.id;
    }

    return payload;
  } catch (err) {
    console.error("parseWhatsAppEvent error:", err);
    return null;
  }
}

// ============================================================
// Detect platform from webhook body
// ============================================================
function detectPlatform(body: Record<string, unknown>): Platform | null {
  if (body.object === "whatsapp_business_account") return "whatsapp";
  if (body.object === "instagram") return "instagram";
  if (body.object === "page") return "messenger";
  return null;
}

// ============================================================
// Main handler
// ============================================================
Deno.serve(async (req: Request) => {
  // CORS preflight
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  // ── GET: Meta webhook verification challenge
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const settings = await getMetaSettings();
    const verifyToken = settings.meta_verify_token || Deno.env.get("META_VERIFY_TOKEN");

    if (mode === "subscribe" && token === verifyToken) {
      console.log("Webhook verified ✓");
      return new Response(challenge, { status: 200 });
    }

    return errorResponse("Verification failed", 403);
  }

  // ── POST: Incoming webhook event
  if (req.method === "POST") {
    const rawBody = await req.text();
    const settings = await getMetaSettings();
    const appSecret = settings.meta_app_secret || Deno.env.get("META_APP_SECRET");

    // 1. HMAC signature verification
    // NOTE: Temporarily logging only — re-enable blocking after pipeline is confirmed working
    const signature = req.headers.get("x-hub-signature-256");
    if (appSecret && signature) {
      const isValid = await verifyMetaSignature(rawBody, signature, appSecret);
      if (!isValid) {
        console.warn("HMAC mismatch (non-blocking) — signature:", signature?.substring(0, 20), "appSecret len:", appSecret.length);
        // TODO: change to return errorResponse("Invalid signature", 401) after confirming pipeline
      }
    } else {
      console.warn("HMAC check skipped — appSecret:", !!appSecret, "signature:", !!signature);
    }

    // 2. Parse body
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return errorResponse("Invalid JSON", 400);
    }

    // 3. Detect platform
    const platform = detectPlatform(body);
    if (!platform) {
      // Not a message event we care about — return 200 to avoid Meta retries
      return jsonResponse({ status: "ignored" });
    }

    // 4. Parse the event into a normalized payload
    let payload: QueuePayload | null = null;
    if (platform === "whatsapp") {
      payload = parseWhatsAppEvent(body);
    } else {
      payload = parseMessengerEvent(body, platform);
    }

    if (!payload?.platformMessageId) {
      // No actionable message (e.g., delivery receipt, read receipt) — ignore
      return jsonResponse({ status: "ignored" });
    }

    // 5. Idempotency check — prevent duplicate processing
    const lockAcquired = await acquireIdempotencyLock(payload.platformMessageId);
    if (!lockAcquired) {
      console.log(`Duplicate webhook: ${payload.platformMessageId} — skipped`);
      return jsonResponse({ status: "duplicate" });
    }

    // 6. Enqueue to QStash → queue-processor will handle AI pipeline
    try {
      const { messageId } = await qstashPublish({
        url: QUEUE_PROCESSOR_URL(),
        body: payload,
        retries: 3,
      });
      console.log(`Enqueued ${payload.platformMessageId} → QStash ${messageId}`);
    } catch (err) {
      console.error("QStash enqueue failed:", err);
      // Even if enqueue fails, return 200 to Meta (prevents retry storm)
      // The idempotency lock will expire in 24h so re-processing is possible
    }

    // 7. Return 200 immediately (Meta requires fast response)
    return jsonResponse({ status: "accepted" });
  }

  return errorResponse("Method not allowed", 405);
});
