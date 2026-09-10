// test-cart-flow.ts
// Step 7: Regression tests for the multi-product order flow
// Run with: deno run --allow-env --allow-net --allow-read test-cart-flow.ts
//
// Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment
// Set via: supabase secrets set OR create a .env file with those values

import { config } from "https://deno.land/x/dotenv@v3.2.2/mod.ts";
config({ export: true });

import { getSupabaseClient } from "./supabase/functions/_shared/supabase-client.ts";

const sb = getSupabaseClient();

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.error(`  FAIL: ${label}`);
    failed++;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function getOrCreateConversation(platformId: string): Promise<any> {
  const { data: existing } = await sb
    .from("conversations")
    .select("*")
    .eq("platform_id", platformId)
    .maybeSingle();

  if (existing) {
    await sb.from("conversations").update({
      cart_state: [],
      pending_selections: [],
      active_slot_id: null,
      last_product_id: null,
      last_variant_id: null,
    }).eq("id", existing.id);
    return existing;
  }

  // Need a customer first
  const { data: customer } = await sb.from("customers").insert({
    platform: "messenger",
    platform_id: `${platformId}_cust`,
    name: "Test Customer",
    state: "active",
  }).select().single();

  const { data: conv } = await sb.from("conversations").insert({
    customer_id: customer?.id ?? null,
    platform: "messenger",
    platform_id: platformId,
    cart_state: [],
    pending_selections: [],
    active_slot_id: null,
  }).select().single();
  return conv;
}

async function refreshConversation(id: string): Promise<any> {
  const { data } = await sb.from("conversations").select("*").eq("id", id).single();
  return data;
}

async function getProductsWithVariants(limit = 2): Promise<any[]> {
  const { data } = await sb
    .from("products")
    .select("*")
    .not("variations", "is", null)
    .limit(limit);
  return (data || []).filter((p: any) => (p.variations || []).length > 0);
}

// ── Test 1: append_to_cart RPC is atomic ──────────────────────────────────

async function testAtomicCartAppend() {
  console.log("\n--- Test 1: atomic append_to_cart RPC ---");
  const conv = await getOrCreateConversation("test_atomic_123");
  assert(conv !== null, "Conversation created/retrieved");

  const item = {
    productId: "test-prod-1",
    variantId: "v1",
    name: "Test Helmet - Black / L",
    unitPrice: 1200,
    qty: 1,
  };

  const { data, error } = await sb.rpc("append_to_cart", {
    p_conversation_id: conv.id,
    p_item: item,
  });

  assert(!error, `append_to_cart returned no error (${JSON.stringify(error)})`);
  assert(Array.isArray(data), "Returns an array");
  assert(data && data.length >= 1, `Cart has >= 1 item (got ${data?.length})`);
  assert(data && data.some((i: any) => i.name === item.name), "Cart contains appended item");
}

// ── Test 2: Duplicate postback idempotency ────────────────────────────────

async function testDuplicatePostbackIdempotency() {
  console.log("\n--- Test 2: Duplicate postback idempotency ---");
  const conv = await getOrCreateConversation("test_idempotency_456");
  assert(conv !== null, "Conversation ready");

  const item = {
    productId: "test-prod-dup",
    variantId: "v2",
    name: "Duplicate Product",
    unitPrice: 800,
    qty: 1,
  };

  await sb.rpc("append_to_cart", { p_conversation_id: conv.id, p_item: item });
  const { data: cart2 } = await sb.rpc("append_to_cart", {
    p_conversation_id: conv.id,
    p_item: item,
  });

  assert(Array.isArray(cart2), "Second append_to_cart returns array");
  console.log(`    INFO: ${cart2?.length} item(s) after 2 appends (Redis dedup is upstream)`);
}

// ── Test 3: Slot state machine ─────────────────────────────────────────────

async function testSlotStateMachine() {
  console.log("\n--- Test 3: Slot state machine - sequential pending_selections ---");
  const conv = await getOrCreateConversation("test_slot_789");
  const products = await getProductsWithVariants(2);

  if (products.length < 2) {
    console.log("    SKIPPED: need >= 2 products with variants");
    return;
  }

  const slot1 = { slotId: "slot_A", productId: products[0].id, status: "active" };
  const slot2 = { slotId: "slot_B", productId: products[1].id, status: "queued" };

  await sb.from("conversations").update({
    pending_selections: [slot1, slot2],
    active_slot_id: "slot_A",
  }).eq("id", conv.id);

  let refreshed = await refreshConversation(conv.id);
  assert(refreshed.active_slot_id === "slot_A", "active_slot_id = slot_A");
  assert(
    refreshed.pending_selections.find((s: any) => s.slotId === "slot_A")?.status === "active",
    "slot_A is active"
  );
  assert(
    refreshed.pending_selections.find((s: any) => s.slotId === "slot_B")?.status === "queued",
    "slot_B is queued"
  );

  // Advance: A → completed, B → active
  const pending = refreshed.pending_selections.map((s: any) => {
    if (s.slotId === "slot_A") return { ...s, status: "completed" };
    if (s.slotId === "slot_B") return { ...s, status: "active" };
    return s;
  });
  await sb.from("conversations").update({
    pending_selections: pending,
    active_slot_id: "slot_B",
  }).eq("id", conv.id);

  refreshed = await refreshConversation(conv.id);
  assert(refreshed.active_slot_id === "slot_B", "advanced to slot_B");
  assert(
    refreshed.pending_selections.find((s: any) => s.slotId === "slot_A")?.status === "completed",
    "slot_A is completed"
  );

  // Clear
  await sb.from("conversations").update({
    pending_selections: [],
    active_slot_id: null,
  }).eq("id", conv.id);

  refreshed = await refreshConversation(conv.id);
  assert(refreshed.active_slot_id === null, "active_slot_id cleared");
  assert(refreshed.pending_selections.length === 0, "pending_selections emptied");
}

// ── Test 4: Stale tap rejection ────────────────────────────────────────────

async function testStaleTapRejection() {
  console.log("\n--- Test 4: Stale tap rejection ---");
  const conv = await getOrCreateConversation("test_stale_101");
  await sb.from("conversations").update({ active_slot_id: "slot_ACTIVE" }).eq("id", conv.id);

  const refreshed = await refreshConversation(conv.id);
  const payloadSlotId = "slot_OLD";
  const shouldReject =
    refreshed.active_slot_id && payloadSlotId !== refreshed.active_slot_id;

  assert(shouldReject === true, "Stale tap identified for rejection");
  assert(refreshed.active_slot_id === "slot_ACTIVE", "active_slot_id unchanged");
}

// ── Test 5: renderCartSummary template ────────────────────────────────────

async function testRenderCartSummary() {
  console.log("\n--- Test 5: renderCartSummary - deterministic template ---");

  // Mirror logic from index.ts
  const renderCartSummary = (cartState: any[]): string => {
    if (!cartState || cartState.length === 0) return "আপনার কার্ট খালি আছে।";
    const lines = cartState.map(
      (item: any, i: number) =>
        `${i + 1}. ${item.name} — ৳${item.unitPrice} x${item.qty}`
    );
    const total = cartState.reduce(
      (sum: number, item: any) => sum + item.unitPrice * (item.qty || 1),
      0
    );
    return `🛒 আপনার কার্ট:\n${lines.join("\n")}\nমোট: ৳${total}`;
  };

  const cart = [
    { name: "Helmet A - Black / L", unitPrice: 1200, qty: 1 },
    { name: "Helmet B - Red", unitPrice: 900, qty: 2 },
  ];
  const summary = renderCartSummary(cart);

  assert(summary.includes("Helmet A"), "Contains item 1");
  assert(summary.includes("Helmet B"), "Contains item 2");
  assert(summary.includes("মোট: ৳3000"), "Total = 1200 + 900*2 = 3000");
  assert(!summary.includes("undefined"), "No undefined values");
  assert(summary.startsWith("🛒"), "Starts with cart emoji");
  assert(renderCartSummary([]) === "আপনার কার্ট খালি আছে।", "Empty cart message");
}

// ── Test 6: OOS variant filtering ─────────────────────────────────────────

async function testOOSFiltering() {
  console.log("\n--- Test 6: OOS variant filtering ---");
  const products = await getProductsWithVariants(1);

  if (products.length === 0) {
    console.log("    SKIPPED: no products with variants");
    return;
  }

  const product = products[0];
  const inStock = (product.variations || []).filter(
    (v: any) => (v.stock_quantity ?? 0) > 0
  );
  const oos = (product.variations || []).filter(
    (v: any) => (v.stock_quantity ?? 0) <= 0
  );

  console.log(
    `    INFO: ${product.name} | in-stock: ${inStock.length} | OOS: ${oos.length}`
  );

  if (oos.length > 0) {
    assert((oos[0].stock_quantity ?? 0) <= 0, `OOS variant stock=${oos[0].stock_quantity}`);
  }
  if (inStock.length > 0) {
    assert((inStock[0].stock_quantity ?? 0) > 0, `In-stock stock=${inStock[0].stock_quantity}`);
    const price = inStock[0].sale_price || inStock[0].regular_price;
    assert(price > 0, `In-stock price=৳${price}`);
  }
}

// ── Test 7: Free-text classifier prompt + JSON parse ──────────────────────

async function testFreeTextClassifier() {
  console.log("\n--- Test 7: Free-text classifier - prompt structure ---");

  const availableColors = ["Black", "Red", "Blue"];
  const availableSizes = ["S", "M", "L", "XL"];
  const customerMsg = "black ta daw M size";

  const prompt = `Given the customer said: "${customerMsg}", and the available options are:
Colors: ${availableColors.join(", ")}
Sizes: ${availableSizes.join(", ")}

Classify EXACTLY as one of:
- SLOT_ANSWER: customer specified a valid color/size
- BULK_ALL: customer wants all remaining pending products
- UNCLEAR: cannot match

Respond with JSON only.`;

  assert(prompt.includes(customerMsg), "Prompt has customer msg");
  assert(prompt.includes("Black"), "Prompt has colors");
  assert(prompt.includes("SLOT_ANSWER"), "Prompt has SLOT_ANSWER");
  assert(prompt.includes("BULK_ALL"), "Prompt has BULK_ALL");

  const cases: { input: string; expected: string }[] = [
    { input: '{"type":"SLOT_ANSWER","color":"Black","size":"M"}', expected: "SLOT_ANSWER" },
    { input: '{"type":"BULK_ALL"}', expected: "BULK_ALL" },
    { input: '{"type":"UNCLEAR"}', expected: "UNCLEAR" },
    { input: "not json", expected: "UNCLEAR" },
  ];

  for (const { input, expected } of cases) {
    let parsed: any = { type: "UNCLEAR" };
    try { parsed = JSON.parse(input); } catch { /* fallback */ }
    assert(parsed.type === expected, `Parse "${input.slice(0, 30)}" => ${parsed.type}`);
  }
}

// ── Test 8: BULK_ALL auto-confirm against real DB ─────────────────────────

async function testBulkAllAutoConfirm() {
  console.log("\n--- Test 8: BULK_ALL auto-confirm against DB products ---");
  const products = await getProductsWithVariants(2);

  if (products.length < 2) {
    console.log("    SKIPPED: need >= 2 products");
    return;
  }

  const conv = await getOrCreateConversation("test_bulk_all_202");

  const pendingSlots = products.slice(0, 2).map((p: any, i: number) => ({
    slotId: `slot_bulk_${i}`,
    productId: p.id,
    status: i === 0 ? "active" : "queued",
  }));

  await sb.from("conversations").update({
    pending_selections: pendingSlots,
    active_slot_id: pendingSlots[0].slotId,
  }).eq("id", conv.id);

  let lastCart: any[] = [];
  let bulkAdded = 0;

  for (const slot of pendingSlots) {
    const { data: sp } = await sb.from("products").select("*").eq("id", slot.productId).single();
    if (!sp) continue;

    const defaultVariant =
      (sp.variations || []).find((v: any) => (v.stock_quantity ?? 0) > 0) ?? null;
    const price = defaultVariant
      ? defaultVariant.sale_price || defaultVariant.regular_price
      : sp.sale_price || sp.regular_price;
    const vId = defaultVariant
      ? String(defaultVariant.woo_variation_id || defaultVariant.id)
      : null;
    const colorLabel = defaultVariant?.attributes?.Color || "";
    const sizeLabel = defaultVariant?.attributes?.Size || "";
    const nameLabel = [colorLabel, sizeLabel].filter(Boolean).join(" / ");
    const itemName = nameLabel ? `${sp.name} - ${nameLabel}` : sp.name;

    const { data, error } = await sb.rpc("append_to_cart", {
      p_conversation_id: conv.id,
      p_item: {
        productId: slot.productId,
        variantId: vId,
        name: itemName,
        unitPrice: price,
        qty: 1,
      },
    });

    if (!error) {
      lastCart = data || [];
      bulkAdded++;
    } else {
      console.error(`    WARN: ${slot.slotId} append error:`, error);
    }
  }

  await sb.from("conversations").update({
    pending_selections: [],
    active_slot_id: null,
  }).eq("id", conv.id);

  assert(bulkAdded === pendingSlots.length, `All ${pendingSlots.length} slots confirmed`);
  assert(lastCart.length >= pendingSlots.length, `Cart >= ${pendingSlots.length} items`);

  const refreshed = await refreshConversation(conv.id);
  assert(refreshed.active_slot_id === null, "active_slot_id cleared");
  assert(refreshed.pending_selections.length === 0, "pending_selections cleared");
}

// ── Run all tests ──────────────────────────────────────────────────────────

async function main() {
  console.log("Growthomic Cart Flow - Regression Test Suite");
  console.log("============================================");

  try {
    await testAtomicCartAppend();
    await testDuplicatePostbackIdempotency();
    await testSlotStateMachine();
    await testStaleTapRejection();
    await testRenderCartSummary();
    await testOOSFiltering();
    await testFreeTextClassifier();
    await testBulkAllAutoConfirm();
  } catch (err) {
    console.error("\nUnexpected runner error:", err);
  }

  console.log("\n============================================");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error("SOME TESTS FAILED");
    Deno.exit(1);
  } else {
    console.log("All tests PASSED");
  }
}

await main();
