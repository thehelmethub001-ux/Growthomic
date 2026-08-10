import { pushOrderToWooCommerce } from "./supabase/functions/_shared/woocommerce.ts";
import "npm:dotenv/config"; // To load .env.local

async function main() {
  console.log("Creating dummy order for WooCommerce...");
  
  const dummyOrder = {
    items: [
      {
        productId: "dummy-id-1",
        wooProductId: undefined, // Testing the custom item push
        name: "Test Helmet - AI Dummy Order (Red)",
        qty: 1,
        unitPrice: 1500
      }
    ],
    customerName: "Mahidul Islam (AI Test)",
    customerPhone: "01700000000",
    deliveryAddress: "Test Address, Dhaka, Bangladesh",
    totalAmount: 1500
  };

  try {
    const result = await pushOrderToWooCommerce(dummyOrder);
    console.log("WooCommerce Push Result:", result);
  } catch (error) {
    console.error("Error pushing order:", error);
  }
}

main();
