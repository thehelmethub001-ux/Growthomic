// _shared/platform-send.ts
// Unified message sender for Facebook Messenger, Instagram DM, WhatsApp Cloud API

import type { Platform } from "./types.ts";

// ============================================================
// Environment variables
// ============================================================
const META_ACCESS_TOKEN = () => Deno.env.get("META_PAGE_ACCESS_TOKEN")!;
const WHATSAPP_PHONE_NUMBER_ID = () => Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")!;

// ============================================================
// Send a text message to a customer
// ============================================================
export async function sendTextMessage(
  platform: Platform,
  platformId: string, // PSID for FB/IG, phone number for WA
  text: string
): Promise<void> {
  if (!text?.trim()) return;

  switch (platform) {
    case "messenger":
      await sendMessengerMessage(platformId, { text });
      break;
    case "instagram":
      await sendInstagramMessage(platformId, { text });
      break;
    case "whatsapp":
      await sendWhatsAppTextMessage(platformId, text);
      break;
  }
}

// ============================================================
// Send a product image to a customer
// ============================================================
export async function sendImageMessage(
  platform: Platform,
  platformId: string,
  imageUrl: string,
  caption?: string
): Promise<void> {
  switch (platform) {
    case "messenger":
      await sendMessengerMessage(platformId, {
        attachment: {
          type: "image",
          payload: { url: imageUrl, is_reusable: true },
        },
      });
      break;
    case "instagram":
      await sendInstagramMessage(platformId, {
        attachment: {
          type: "image",
          payload: { url: imageUrl, is_reusable: true },
        },
      });
      break;
    case "whatsapp":
      await sendWhatsAppMediaMessage(platformId, "image", imageUrl, caption);
      break;
  }
}

// ============================================================
// Send a video to a customer
// ============================================================
export async function sendVideoMessage(
  platform: Platform,
  platformId: string,
  videoUrl: string,
  caption?: string
): Promise<void> {
  switch (platform) {
    case "messenger":
      await sendMessengerMessage(platformId, {
        attachment: {
          type: "video",
          payload: { url: videoUrl, is_reusable: true },
        },
      });
      break;
    case "instagram":
      await sendInstagramMessage(platformId, {
        attachment: {
          type: "video",
          payload: { url: videoUrl, is_reusable: true },
        },
      });
      break;
    case "whatsapp":
      await sendWhatsAppMediaMessage(platformId, "video", videoUrl, caption);
      break;
  }
}

// ============================================================
// Facebook Messenger
// ============================================================
async function sendMessengerMessage(
  psid: string,
  message: Record<string, unknown>
): Promise<void> {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/me/messages?access_token=${META_ACCESS_TOKEN()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: psid },
        message,
        messaging_type: "RESPONSE",
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error(`[Messenger] Send failed for ${psid}: ${err}`);
    throw new Error(`Messenger send failed: ${err}`);
  }
}

// ============================================================
// Instagram DM (uses same Graph API as Messenger)
// ============================================================
async function sendInstagramMessage(
  igScopedId: string,
  message: Record<string, unknown>
): Promise<void> {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/me/messages?access_token=${META_ACCESS_TOKEN()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: igScopedId },
        message,
        messaging_type: "RESPONSE",
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error(`[Instagram] Send failed for ${igScopedId}: ${err}`);
    throw new Error(`Instagram send failed: ${err}`);
  }
}

// ============================================================
// WhatsApp Cloud API
// ============================================================
async function sendWhatsAppTextMessage(
  phoneNumber: string,
  text: string
): Promise<void> {
  const phoneNumberId = WHATSAPP_PHONE_NUMBER_ID();
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${META_ACCESS_TOKEN()}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phoneNumber,
        type: "text",
        text: { body: text, preview_url: false },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error(`[WhatsApp] Text send failed for ${phoneNumber}: ${err}`);
    throw new Error(`WhatsApp text send failed: ${err}`);
  }
}

async function sendWhatsAppMediaMessage(
  phoneNumber: string,
  type: "image" | "video" | "audio",
  mediaUrl: string,
  caption?: string
): Promise<void> {
  const phoneNumberId = WHATSAPP_PHONE_NUMBER_ID();
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${META_ACCESS_TOKEN()}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phoneNumber,
        type,
        [type]: {
          link: mediaUrl,
          ...(caption ? { caption } : {}),
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error(`[WhatsApp] Media send failed for ${phoneNumber}: ${err}`);
    throw new Error(`WhatsApp media send failed: ${err}`);
  }
}

// ============================================================
// Download media from Meta CDN (for customer-sent images/voice)
// Used to fetch media before sending to Whisper or Gemini Vision
// ============================================================
export async function downloadMetaMedia(mediaId: string): Promise<{
  url: string;
  mimeType: string;
}> {
  // Step 1: Get the media URL
  const metaRes = await fetch(
    `https://graph.facebook.com/v19.0/${mediaId}`,
    {
      headers: { Authorization: `Bearer ${META_ACCESS_TOKEN()}` },
    }
  );
  if (!metaRes.ok) throw new Error(`Failed to get media info for ${mediaId}`);
  const meta = await metaRes.json();

  return {
    url: meta.url,
    mimeType: meta.mime_type ?? "application/octet-stream",
  };
}
