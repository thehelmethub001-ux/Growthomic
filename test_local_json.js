const fs = require('fs');

try {
  const data = JSON.parse(fs.readFileSync('temp_products.json', 'utf8'));
  const products = Array.isArray(data) ? data : data.data || [];
  const affected = products.filter(p => {
    if (!p.variations || p.variations.length === 0) return false;
    return p.variations.every(v => !v.attributes || !v.attributes.Color);
  });

  console.log(`\n=== Products with variations but NO Color attribute (${affected.length} found) ===`);
  affected.forEach(p => console.log(`- ${p.name} (ID: ${p.id})`));
} catch (e) {
  console.log("Could not read temp_products.json:", e.message);
}
