import { config } from "https://deno.land/x/dotenv@v3.2.2/mod.ts";
config({ export: true });
import { getSupabaseClient } from "./supabase/functions/_shared/supabase-client.ts";

async function testButtonFlow() {
  const sb = getSupabaseClient();
  const customerId = "cust_test_" + Date.now();
  
  // 1. Create a fake customer
  const { data: customer } = await sb.from("customers").insert({
    platform: "messenger",
    platform_id: customerId,
    name: "Test Customer",
    state: "active"
  }).select().single();
  
  // 2. Create a conversation
  const { data: conversation } = await sb.from("conversations").insert({
    customer_id: customer.id,
    cart_state: [],
    search_cursor: 0
  }).select().single();
  
  console.log("Created Conversation:", conversation.id);
  
  // 3. Find two products with variations in stock
  const { data: products } = await sb.from("products").select("id, name, regular_price, variations").limit(2);
  const p1 = products![0];
  const p2 = products![1];
  
  const v1 = (p1.variations as any[])?.[0];
  const v2 = (p2.variations as any[])?.[0];
  
  console.log(`Product 1: ${p1.name} | Variant: ${v1?.color || v1?.id}`);
  console.log(`Product 2: ${p2.name} | Variant: ${v2?.color || v2?.id}`);
  
  // 4. Simulate CMD_SELECT_VARIANT for product 1
  const cartState = [
    { productId: p1.id, variantId: v1?.id || null, name: p1.name, unitPrice: p1.regular_price, qty: 1, imageUrl: "" },
    { productId: p2.id, variantId: v2?.id || null, name: p2.name, unitPrice: p2.regular_price, qty: 1, imageUrl: "" }
  ];
  
  await sb.from("conversations").update({ cart_state: cartState }).eq("id", conversation.id);
  console.log("Updated cart_state in DB with 2 items.");
  
  // 5. Simulate AI generating orderData
  const orderData = {
    customerName: "Test Name",
    customerPhone: "01711223344",
    deliveryAddress: "Dhaka",
    items: cartState,
    totalAmount: p1.regular_price + p2.regular_price
  };
  
  // 6. Save to local orders table (queue-processor logic)
  const { data: newOrder, error } = await sb.from("orders").insert({
    customer_id: customer.id,
    conversation_id: conversation.id,
    items: orderData.items,
    total_amount: orderData.totalAmount,
    delivery_address: orderData.deliveryAddress,
    customer_phone: orderData.customerPhone,
    customer_name: orderData.customerName,
    status: "pending"
  }).select().single();
  
  if (error) {
    console.error("Failed to insert order", error);
    return;
  }
  
  console.log("Inserted order successfully!");
  console.log("Order items array:");
  console.log(JSON.stringify(newOrder.items, null, 2));
  console.log(`Total amount: ৳${newOrder.total_amount}`);
}

testButtonFlow().catch(console.error);
