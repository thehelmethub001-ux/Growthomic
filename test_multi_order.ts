import { getGeminiResponse } from "./supabase/functions/_shared/gemini.ts";
import { parseOrderContactInfo } from "./supabase/functions/_shared/spamguard.ts"; // Just so it compiles if needed, actually we just need gemini
import "dotenv/config";

async function run() {
  const history1 = [
    { role: "customer", content: "Spark Metro Graphics er dam koto?", media_type: null, media_url: null, created_at: "" },
    { role: "ai", content: "Spark Metro Graphics er dam 1750 taka.", media_type: null, media_url: null, created_at: "" },
    { role: "customer", content: "Ar Spark Metro Solid er dam?", media_type: null, media_url: null, created_at: "" },
    { role: "ai", content: "Spark Metro Solid er dam 1650 taka.", media_type: null, media_url: null, created_at: "" }
  ];
  
  const customer1 = { id: "cust-1", name: "Test User", platformId: "01711111111" };
  
  console.log("=== SCENARIO 1: 2 ta e nibo (Multiple Different Products) ===");
  const res1 = await getGeminiResponse("2 ta e nibo. Number 01711111111, Address: Dhaka", history1 as any, customer1 as any, null, "messenger", undefined, "image");
  
  console.log("AI Parsed Order Data (Multiple Items):", JSON.stringify(res1.orderData?.items, null, 2));
  console.log("AI Parsed Total Amount:", res1.orderData?.totalAmount);

  console.log("\n=== SCENARIO 2: 2 ta helmet lagbe (Same Product, Multi Quantity) ===");
  const history2 = [
    { role: "customer", content: "Spark X25 er dam koto?", media_type: null, media_url: null, created_at: "" },
    { role: "ai", content: "Spark X25 er dam 1500 taka.", media_type: null, media_url: null, created_at: "" }
  ];
  const res2 = await getGeminiResponse("2 ta helmet lagbe. Number 01711111111, Address: Dhaka", history2 as any, customer1 as any, null, "messenger", undefined, "image");
  
  console.log("AI Parsed Order Data (Single Item, Multi Qty):", JSON.stringify(res2.orderData?.items, null, 2));
  console.log("AI Parsed Total Amount:", res2.orderData?.totalAmount);
}

run().catch(console.error);
