// _shared/platform-send.ts
// Unified message sender for Facebook Messenger, Instagram DM, WhatsApp Cloud API

import type { Platform } from "./types.ts";

// ============================================================
// Environment variables & DB config
// ============================================================
import { getSupabaseClient } from "./supabase-client.ts";
import { decryptSecret } from "./encryption.ts";

export async function getMetaAccessToken(): Promise<string> {
  const sb = getSupabaseClient();
  const { data } = await sb.from("business_settings").select("meta_access_token").limit(1).single();
  let token = data?.meta_access_token || Deno.env.get("META_PAGE_ACCESS_TOKEN")!;
  if (token && token.includes(":")) {
    token = await decryptSecret(token);
  }
  return token;
}

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
): Promise<string | undefined> { // returns platform message ID if available
  switch (platform) {
    case "messenger":
      return await sendMessengerMessage(platformId, {
        attachment: {
          type: "image",
          payload: { url: imageUrl, is_reusable: true },
        },
      });
    case "instagram":
      return await sendInstagramMessage(platformId, {
        attachment: {
          type: "image",
          payload: { url: imageUrl, is_reusable: true },
        },
      });
    case "whatsapp":
      await sendWhatsAppMediaMessage(platformId, "image", imageUrl, caption);
      return undefined;
  }
}

// ============================================================
// Send a product carousel (Messenger / Instagram Generic Template)
// Native swipeable carousel — up to 10 cards, each with image + title +
// subtitle (price) + optional buttons. No extra Meta setup required beyond
// what's already used for text/image sends.
// ============================================================
export interface CarouselElement {
  title: string;
  subtitle?: string;
  imageUrl: string;
  buttonTitle?: string; // e.g. "অর্ডার করুন" — omitted if no buttonPayload
  buttonPayload?: string; // postback payload the webhook will receive on tap
}

export async function sendCarouselMessage(
  platform: "messenger" | "instagram",
  platformId: string,
  elements: CarouselElement[]
): Promise<string | undefined> {
  const capped = elements.slice(0, 10); // Meta Generic Template limit
  const payload = {
    attachment: {
      type: "template",
      payload: {
        template_type: "generic",
        image_aspect_ratio: "square",
        elements: capped.map((el) => ({
          title: el.title.slice(0, 80),
          subtitle: el.subtitle?.slice(0, 80),
          image_url: el.imageUrl,
          default_action: {
            type: "web_url",
            url: el.imageUrl, // tapping the card opens the full-size image
          },
          ...(el.buttonTitle && el.buttonPayload
            ? {
                buttons: [
                  {
                    type: "postback",
                    title: el.buttonTitle.slice(0, 20),
                    payload: el.buttonPayload,
                  },
                ],
              }
            : {}),
        })),
      },
    },
  };

  if (platform === "messenger") return await sendMessengerMessage(platformId, payload);
  return await sendInstagramMessage(platformId, payload);
}

// ============================================================
// WhatsApp product carousel (Commerce Catalog required)
// Sends a "product_list" interactive message referencing items already
// synced into the connected Meta Commerce Catalog (see _shared/meta-catalog.ts
// and the catalog-sync edge function). retailerIds are product.id values.
// ============================================================
export async function sendWhatsAppProductList(
  phoneNumber: string,
  catalogId: string,
  retailerIds: string[],
  headerText?: string,
  bodyText?: string
): Promise<void> {
  const phoneNumberId = WHATSAPP_PHONE_NUMBER_ID();
  const capped = retailerIds.slice(0, 30); // Meta multi-product limit

  const interactive =
    capped.length === 1
      ? {
          type: "product",
          body: { text: bodyText || "আপনার জন্য এই প্রোডাক্টটি পাওয়া গেছে:" },
          action: { catalog_id: catalogId, product_retailer_id: capped[0] },
        }
      : {
          type: "product_list",
          header: { type: "text", text: headerText || "প্রোডাক্টসমূহ" },
          body: { text: bodyText || "আপনার জন্য এই প্রোডাক্টগুলো পাওয়া গেছে, দেখে নিন:" },
          action: {
            catalog_id: catalogId,
            sections: [{ title: "প্রোডাক্টসমূহ", product_items: capped.map((id) => ({ product_retailer_id: id })) }],
          },
        };

  const res = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await getMetaAccessToken()}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phoneNumber,
      type: "interactive",
      interactive,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[WhatsApp] Product list send failed for ${phoneNumber}: ${err}`);
    throw new Error(`WhatsApp product list send failed: ${err}`);
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
): Promise<string | undefined> { // returns mid if available
  const res = await fetch(
    `https://graph.facebook.com/v19.0/me/messages?access_token=${await getMetaAccessToken()}`,
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
  const json = await res.json();
  return json?.message_id as string | undefined; // FB returns message_id
}

// ============================================================
// Instagram DM (uses same Graph API as Messenger)
// ============================================================
async function sendInstagramMessage(
  igScopedId: string,
  message: Record<string, unknown>
): Promise<void> {
  const res = await fetch(
    `https://graph.facebook.com/v19.0/me/messages?access_token=${await getMetaAccessToken()}`,
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
        Authorization: `Bearer ${await getMetaAccessToken()}`,
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
        Authorization: `Bearer ${await getMetaAccessToken()}`,
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
// Quick Replies for Messenger/Instagram
// ============================================================
export async function sendQuickReplies(
  platform: "messenger" | "instagram",
  platformId: string,
  text: string,
  replies: Array<{ title: string; payload: string }>
): Promise<string | undefined> {
  const payload = {
    text,
    quick_replies: replies.slice(0, 13).map((r) => ({
      content_type: "text",
      title: r.title.slice(0, 20),
      payload: r.payload,
    })),
  };

  if (platform === "messenger") return await sendMessengerMessage(platformId, payload);
  return await sendInstagramMessage(platformId, payload);
}

// ============================================================
// Interactive Buttons for WhatsApp (Max 3 buttons)
// ============================================================
export async function sendWhatsAppInteractiveButtons(
  phoneNumber: string,
  text: string,
  buttons: Array<{ id: string; title: string }>
): Promise<void> {
  const phoneNumberId = WHATSAPP_PHONE_NUMBER_ID();
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await getMetaAccessToken()}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phoneNumber,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text },
          action: {
            buttons: buttons.slice(0, 3).map((b) => ({
              type: "reply",
              reply: {
                id: b.id,
                title: b.title.slice(0, 20),
              },
            })),
          },
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error(`[WhatsApp] Interactive buttons failed for ${phoneNumber}: ${err}`);
  }
}

// ============================================================
// Interactive List for WhatsApp (Max 10 rows)
// ============================================================
export async function sendWhatsAppInteractiveList(
  phoneNumber: string,
  text: string,
  buttonText: string,
  sections: Array<{
    title: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>
): Promise<void> {
  const phoneNumberId = WHATSAPP_PHONE_NUMBER_ID();
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await getMetaAccessToken()}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phoneNumber,
        type: "interactive",
        interactive: {
          type: "list",
          body: { text },
          action: {
            button: buttonText.slice(0, 20),
            sections: sections.map((s) => ({
              title: s.title.slice(0, 24),
              rows: s.rows.slice(0, 10).map((r) => ({
                id: r.id,
                title: r.title.slice(0, 24),
                ...(r.description ? { description: r.description.slice(0, 72) } : {}),
              })),
            })),
          },
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error(`[WhatsApp] Interactive list failed for ${phoneNumber}: ${err}`);
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
      headers: { Authorization: `Bearer ${await getMetaAccessToken()}` },
    }
  );
  if (!metaRes.ok) throw new Error(`Failed to get media info for ${mediaId}`);
  const meta = await metaRes.json();

  return {
    url: meta.url,
    mimeType: meta.mime_type ?? "application/octet-stream",
  };
}
