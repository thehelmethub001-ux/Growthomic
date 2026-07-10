// _shared/spamguard.ts
// SpamGuard: score-based spam detection
// Runs before AI engine in the queue-processor pipeline

import {
  incrementSpamRateCounter,
} from "./upstash.ts";
import {
  updateCustomerSpamScore,
} from "./supabase-client.ts";
import type { Customer } from "./types.ts";

// ============================================================
// Spam thresholds
// ============================================================
const RATE_SPAM_THRESHOLD = 10;    // 10+ messages in 5 minutes
const SCORE_SPAM_THRESHOLD = 70;   // Total score to auto-flag

// Individual signal scores
const SCORE_HIGH_RATE = 40;
const SCORE_REPEATED_MSG = 20;
const SCORE_ABUSIVE = 30;

// ============================================================
// Abusive / profane keyword list (Bangla + English)
// ============================================================
const ABUSIVE_KEYWORDS = [
  // English
  "fuck", "shit", "bitch", "asshole", "bastard", "idiot", "stupid",
  // Bangla transliteration
  "magi", "chudi", "baal", "shala", "haramzada", "bokachoda",
  "gaandu", "choda", "kuttar bacha", "harami",
];

function containsAbusiveLanguage(text: string): boolean {
  const lower = text.toLowerCase();
  return ABUSIVE_KEYWORDS.some((word) => lower.includes(word));
}

// ============================================================
// SpamGuard result
// ============================================================
export interface SpamGuardResult {
  isSpam: boolean;
  score: number;
  signals: string[];
  shouldBlock: boolean; // true = do not reply, lock conversation
}

// ============================================================
// runSpamGuard()
// Call this in queue-processor BEFORE AI engine.
// Returns SpamGuardResult. If isSpam → send to spam_queue.
// ============================================================
export async function runSpamGuard(
  customer: Customer,
  messageText: string | undefined,
  recentMessages: Array<{ content: string | null }>
): Promise<SpamGuardResult> {
  // VIP customers are never flagged
  if (customer.isVip) {
    return { isSpam: false, score: 0, signals: [], shouldBlock: false };
  }

  // Already manually blocked
  if (!customer.aiReplyEnabled) {
    return {
      isSpam: true,
      score: 100,
      signals: ["manually_disabled"],
      shouldBlock: true,
    };
  }

  let score = customer.spamScore; // carry forward existing score
  const signals: string[] = [];

  // ── Signal 1: High message rate (10+ in 5 min via Redis counter)
  const rate = await incrementSpamRateCounter(customer.id);
  if (rate >= RATE_SPAM_THRESHOLD) {
    score += SCORE_HIGH_RATE;
    signals.push(`high_rate:${rate}`);
  }

  // ── Signal 2: Repeated message (same text sent 3+ times in history)
  if (messageText) {
    const repetitions = recentMessages.filter(
      (m) => m.content?.trim().toLowerCase() === messageText.trim().toLowerCase()
    ).length;
    if (repetitions >= 3) {
      score += SCORE_REPEATED_MSG;
      signals.push(`repeated_message:${repetitions}`);
    }
  }

  // ── Signal 3: Abusive language
  if (messageText && containsAbusiveLanguage(messageText)) {
    score += SCORE_ABUSIVE;
    signals.push("abusive_language");
  }

  // Cap score at 100
  score = Math.min(score, 100);

  const isSpam = score >= SCORE_SPAM_THRESHOLD || customer.isSpam;

  // Persist updated score to DB
  if (score !== customer.spamScore || isSpam !== customer.isSpam) {
    await updateCustomerSpamScore(customer.id, score, isSpam);
  }

  return {
    isSpam,
    score,
    signals,
    shouldBlock: isSpam,
  };
}
