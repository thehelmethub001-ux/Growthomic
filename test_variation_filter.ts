import * as fs from 'fs';

const products = [
  {
    "category": "হেলমেট",
    "id": "62118d9f-8f47-4569-9e38-38c1e5b38d8a",
    "name": "Spark Metro Solid - Half Face",
    "variations": [
      {
        "attributes": { "Color": "Matt Blue" },
        "image_url": "https://url-matt-blue",
        "stock_quantity": 0,
      },
      {
        "attributes": { "Color": "Glossy RED" },
        "image_url": "https://url-glossy-red",
        "stock_quantity": 10,
      }
    ]
  },
  {
    "category": "হেলমেট",
    "id": "a8b9330e-6cba-4815-9834-a538aa1e2cd2",
    "name": "Spark Metro Graphics - Half face",
    "variations": [
      {
        "attributes": { "Color": "Glossy Black Blue" },
        "image_url": "https://url-glossy-black-blue",
        "stock_quantity": 0,
      },
      {
        "attributes": { "Color": "Matt Black Blue" },
        "image_url": "https://url-matt-black-blue",
        "stock_quantity": 10,
      }
    ]
  }
];

// Test the filter logic added in gemini.ts
products.forEach(product => {
  const isMultiColorReq = true; // Simulating category/multi-color request
  let variationUrls: string[] = [];
  
  if (isMultiColorReq && product.variations && Array.isArray(product.variations)) {
    variationUrls = Array.from(new Set(
      product.variations
        .filter((v: any) => (v.stock_quantity ?? v.stock ?? 0) > 0)
        .map((v: any) => v.image_url || v.imageUrl)
        .filter((url: any) => typeof url === "string" && url.trim().length > 0 && url.startsWith("http"))
    )).slice(0, 8) as string[];
  }
  
  console.log(`Product: ${product.name}`);
  console.log("Filtered URLs:", variationUrls);
});
