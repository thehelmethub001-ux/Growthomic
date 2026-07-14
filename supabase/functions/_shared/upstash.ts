// _shared/upstash.ts
// Upstash Redis (distributed locks) + QStash (job queue) clients
// Both use HTTP REST — compatible with Supabase Edge Functions (Deno)

// ============================================================
// UPSTASH REDIS — idempotency + conversation locks
// ============================================================

const REDIS_URL = () => Deno.env.get("UPSTASH_REDIS_REST_URL")!;
const REDIS_TOKEN = () => Deno.env.get("UPSTASH_REDIS_REST_TOKEN")!;

async function redisCommand(command: string[]): Promise<unknown> {
  const res = await fetch(`${REDIS_URL()}/${command.join("/")}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN()}` },
  });
  if (!res.ok) throw new Error(`Redis error: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.result;
}

/**
 * Set a key with EX (seconds TTL) only if it does not exist (NX).
 * Returns true if the key was set (lock acquired), false if already existed.
 */
export async function redisSetNX(key: string, value: string, ttlSeconds: number): Promise<boolean> {
  // Upstash REST: SET key value EX ttl NX
  const result = await redisCommand(["SET", key, value, "EX", String(ttlSeconds), "NX"]);
  return result === "OK";
}

/**
 * Delete a Redis key (release a lock).
 */
export async function redisDel(key: string): Promise<void> {
  await redisCommand(["DEL", key]);
}

/**
 * Get a Redis key value.
 */
export async function redisGet(key: string): Promise<string | null> {
  const result = await redisCommand(["GET", key]);
  return result as string | null;
}

/**
 * Increment a Redis key by 1 with an optional expiry (seconds).
 * Returns the new value.
 */
export async function redisIncr(key: string, ttlSeconds?: number): Promise<number> {
  const result = await redisCommand(["INCR", key]) as number;
  if (ttlSeconds) {
    // Set expiry only if this is the first increment (EXPIRE only when result === 1)
    if (result === 1) {
      await redisCommand(["EXPIRE", key, String(ttlSeconds)]);
    }
  }
  return result;
}

// ============================================================
// Lock helpers (idempotency + conversation)
// ============================================================

/**
 * Idempotency lock: prevents processing the same webhook twice.
 * Key: webhook:{platformMessageId}
 * TTL: 24 hours
 */
export async function acquireIdempotencyLock(platformMessageId: string): Promise<boolean> {
  return redisSetNX(`webhook:${platformMessageId}`, "1", 86400);
}

/**
 * Conversation lock: prevents concurrent AI processing on same conversation.
 * Key: lock:conversation:{conversationId}
 * TTL: 30 seconds
 */
export async function acquireConversationLock(conversationId: string): Promise<boolean> {
  return redisSetNX(`lock:conversation:${conversationId}`, "1", 30);
}

export async function releaseConversationLock(conversationId: string): Promise<void> {
  await redisDel(`lock:conversation:${conversationId}`);
}

/**
 * Spam rate counter: counts messages from a customer in the last 5 minutes.
 * Key: spam:rate:{customerId}
 * TTL: 300 seconds (5 min)
 * Returns new count.
 */
export async function incrementSpamRateCounter(customerId: string): Promise<number> {
  return redisIncr(`spam:rate:${customerId}`, 300);
}

// ============================================================
// UPSTASH QSTASH — HTTP job queue
// ============================================================

const QSTASH_URL = () => {
  const base = (Deno.env.get("QSTASH_URL") || "https://qstash.upstash.io").replace(/\/$/, "");
  return base.includes("/v2") ? base : `${base}/v2`;
};
const QSTASH_TOKEN = () => Deno.env.get("QSTASH_TOKEN")!;

interface QStashPublishOptions {
  /** Target URL (your Edge Function URL) */
  url: string;
  /** JSON body to send */
  body: unknown;
  /** Delay in seconds before delivering the message */
  delaySeconds?: number;
  /** Number of retries (default 3) */
  retries?: number;
}

interface QStashPublishResult {
  messageId: string;
}

/**
 * Publish a message to QStash.
 * QStash will POST the body to the given URL after the optional delay.
 */
export async function qstashPublish(opts: QStashPublishOptions): Promise<QStashPublishResult> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${QSTASH_TOKEN()}`,
    "Content-Type": "application/json",
    "Upstash-Retries": String(opts.retries ?? 3),
  };

  if (opts.delaySeconds && opts.delaySeconds > 0) {
    headers["Upstash-Delay"] = `${opts.delaySeconds}s`;
  }

  const res = await fetch(`${QSTASH_URL()}/publish/${opts.url}`, {
    method: "POST",
    headers,
    body: JSON.stringify(opts.body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`QStash publish failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  return { messageId: json.messageId };
}

/**
 * Verify that an incoming request is genuinely from QStash.
 * QStash signs requests with HMAC-SHA256.
 * Call this at the top of every queue-callback Edge Function.
 */
export async function verifyQStashSignature(req: Request): Promise<boolean> {
  const signingKey = Deno.env.get("QSTASH_CURRENT_SIGNING_KEY");
  const nextSigningKey = Deno.env.get("QSTASH_NEXT_SIGNING_KEY");

  if (!signingKey) {
    console.warn("QSTASH_CURRENT_SIGNING_KEY not set — skipping signature verification");
    return true; // Allow in dev; MUST be set in production
  }

  const signature = req.headers.get("Upstash-Signature");
  if (!signature) return false;

  const body = await req.text();
  const url = req.url;

  for (const key of [signingKey, nextSigningKey].filter(Boolean)) {
    const isValid = await verifyJWT(signature, body, url, key!);
    if (isValid) return true;
  }

  return false;
}

async function verifyJWT(token: string, body: string, url: string, signingKey: string): Promise<boolean> {
  try {
    // QStash uses a signed JWT — decode header.payload, verify signature
    const parts = token.split(".");
    if (parts.length !== 3) return false;

    const [headerB64, payloadB64, signatureB64] = parts;
    const data = `${headerB64}.${payloadB64}`;

    const keyBytes = new TextEncoder().encode(signingKey);
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const sigBytes = base64UrlDecode(signatureB64);
    const dataBytes = new TextEncoder().encode(data);

    const valid = await crypto.subtle.verify("HMAC", cryptoKey, sigBytes, dataBytes);
    if (!valid) return false;

    // Check payload claims
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) return false; // expired
    if (payload.nbf && payload.nbf > now) return false; // not yet valid

    return true;
  } catch {
    return false;
  }
}

function base64UrlDecode(s: string): Uint8Array {
  const base64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/**
 * Cancel a scheduled QStash message (e.g., cancel follow-up if customer replied).
 */
export async function qstashCancel(messageId: string): Promise<void> {
  await fetch(`${QSTASH_URL}/messages/${messageId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${QSTASH_TOKEN()}` },
  });
}
