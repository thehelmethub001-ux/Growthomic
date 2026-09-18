const existing = {
  id: "prod_1",
  manually_edited: true,
  name: "Spark Metro Graphics - CUSTOM NAME",
  sku: "CUSTOM-SKU-123"
};

const payload = {
  name: "Spark Metro Graphics - ORIGINAL WOOCOMMERCE NAME",
  sku: "ORIGINAL-SKU-456",
  regular_price: 1500,
  sale_price: 1400,
  stock_quantity: 10,
  category: "Helmets",
  is_active: true,
  description: "Description from WooCommerce"
};

// Simulate the route logic:
if (existing) {
  // Prevent overwriting manual description edits from Growthomic Dashboard
  delete payload.description;

  // Manually edited products/variations are protected from sync overwrite. Only dashboard delete removes them.
  if (existing.manually_edited) {
    delete payload.regular_price;
    delete payload.sale_price;
    delete payload.stock_quantity;
    delete payload.category;
    delete payload.is_active;
    delete payload.name;
    delete payload.sku;
  }
}

console.log("Existing Product in DB:", existing);
console.log("Final Payload to Update DB:", payload);

if (payload.name === undefined) {
  console.log("✅ SUCCESS: Name is protected and wiped from payload.");
} else {
  console.log("❌ FAILED: Name is still in payload:", payload.name);
}

if (payload.sku === undefined) {
  console.log("✅ SUCCESS: SKU is protected and wiped from payload.");
} else {
  console.log("❌ FAILED: SKU is still in payload:", payload.sku);
}
