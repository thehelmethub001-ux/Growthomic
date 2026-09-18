# -*- coding: utf-8 -*-
# test_woo_order.py
# DB theke supabase client diye woo credentials fetch kore test order push korbe

import urllib.request
import urllib.error
import json
import base64
import os

# Read env from frontend/.env.local and supabase config
# Try to find credentials from existing test scripts

def read_env_files():
    env = {}
    paths = [
        "frontend/.env.local",
        "frontend/.env.production",
        ".env",
    ]
    for path in paths:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if "=" in line and not line.startswith("#"):
                        k, _, v = line.partition("=")
                        env[k.strip()] = v.strip().strip('"').strip("'")
    return env

env = read_env_files()

# Find existing js test file for supabase url
# Try to read from a test file that has the real credentials
supabase_url = None
supabase_key = None

# Check test-products.js or similar for hardcoded URLs
for fname in ["test-products.js", "test-woo.js", "test-sync.js", "inspect_orders_node.js"]:
    if os.path.exists(fname):
        with open(fname, "r", encoding="utf-8") as f:
            content = f.read()
            if "supabase.co" in content:
                import re
                url_match = re.search(r'https://[a-z]+\.supabase\.co', content)
                if url_match:
                    supabase_url = url_match.group(0)
                key_match = re.search(r'eyJ[A-Za-z0-9_-]{20,}', content)
                if key_match:
                    supabase_key = key_match.group(0)
                if supabase_url and supabase_key:
                    print(f"✅ Found credentials in {fname}")
                    break

if not supabase_url:
    print("❌ Could not find Supabase URL in local files.")
    print("Please provide SUPABASE_URL and SUPABASE_KEY manually.")
    print("Or check if any test file has the credentials.")
    
    # List what we found in env
    for k in ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"]:
        if k in env and env[k] and "[SENSITIVE]" not in env[k]:
            supabase_url = env[k]
            print(f"Found URL from env: {supabase_url}")
    
    for k in ["SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]:
        if k in env and env[k] and "[SENSITIVE]" not in env[k]:
            supabase_key = env[k]
            print(f"Found KEY from env")
    
    if not supabase_url or not supabase_key:
        exit(1)

print(f"Supabase URL: {supabase_url}")

# Fetch business settings from Supabase
def supabase_get(table, select="*", filters=None):
    url = f"{supabase_url}/rest/v1/{table}?select={select}&limit=1"
    if filters:
        for k, v in filters.items():
            url += f"&{k}=eq.{v}"
    
    req = urllib.request.Request(
        url,
        headers={
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json",
        }
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

print("\n📡 Fetching WooCommerce settings from DB...")
settings_list = supabase_get("business_settings", "woo_api_url,woo_consumer_key,woo_consumer_secret")
if not settings_list:
    print("❌ No business settings found")
    exit(1)

settings = settings_list[0]
woo_url = settings.get("woo_api_url", "").rstrip("/")
woo_key = settings.get("woo_consumer_key", "")
woo_secret = settings.get("woo_consumer_secret", "")

if not woo_url or not woo_key:
    print("❌ WooCommerce credentials missing in DB settings")
    exit(1)

print(f"✅ WooCommerce URL: {woo_url}")

# Fetch a product with variations
print("\n📡 Fetching products with variations...")
products_url = f"{supabase_url}/rest/v1/products?select=id,name,woo_product_id,variations&woo_product_id=not.is.null&limit=20"
req = urllib.request.Request(
    products_url,
    headers={
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
    }
)
with urllib.request.urlopen(req) as r:
    products = json.loads(r.read())

# Find a variable product with sku + attributes in variations
test_product = None
test_variant = None
for p in products:
    variations = p.get("variations") or []
    for v in variations:
        if v.get("woo_variation_id") and v.get("sku") and v.get("attributes"):
            test_product = p
            test_variant = v
            break
    if test_product:
        break

if not test_product:
    print("⚠️  No product with woo_variation_id + sku + attributes found.")
    print("Checking what's in variations...")
    for p in products[:3]:
        vars_ = p.get("variations") or []
        print(f"  {p['name']}: {len(vars_)} variations")
        if vars_:
            print(f"    Sample: {json.dumps(vars_[0], ensure_ascii=False)}")
    exit(1)

print(f"✅ Test Product: {test_product['name']}")
print(f"   woo_product_id: {test_product['woo_product_id']}")
print(f"   Variant: {json.dumps(test_variant, ensure_ascii=False, indent=2)}")

# Build WooCommerce line item (same as our woocommerce.ts)
attr_meta = [
    {
        "key": f"attribute_pa_{k.lower().replace(' ', '-')}",
        "value": str(v)
    }
    for k, v in (test_variant.get("attributes") or {}).items()
]

line_item = {
    "product_id": test_product["woo_product_id"],
    "quantity": 1,
    "variation_id": test_variant["woo_variation_id"],
}
if test_variant.get("sku"):
    line_item["sku"] = test_variant["sku"]
if attr_meta:
    line_item["meta_data"] = attr_meta

print(f"\n📦 Line item: {json.dumps(line_item, ensure_ascii=False, indent=2)}")

payload = {
    "payment_method": "cod",
    "payment_method_title": "Cash on Delivery",
    "set_paid": False,
    "status": "processing",
    "billing": {
        "first_name": "Test",
        "last_name": "Growthomic",
        "phone": "01700000000",
        "address_1": "Test Address, Dhaka",
        "country": "BD",
    },
    "shipping": {
        "first_name": "Test",
        "last_name": "Growthomic",
        "address_1": "Test Address, Dhaka",
        "country": "BD",
    },
    "line_items": [line_item],
    "meta_data": [{"key": "_growthomic_source", "value": "test_script"}],
}

# Push to WooCommerce
creds = base64.b64encode(f"{woo_key}:{woo_secret}".encode()).decode()
api_url = f"{woo_url}/wp-json/wc/v3/orders"

print(f"\n🚀 Pushing test order to WooCommerce...")
req = urllib.request.Request(
    api_url,
    data=json.dumps(payload).encode("utf-8"),
    headers={
        "Content-Type": "application/json",
        "Authorization": f"Basic {creds}",
    },
    method="POST"
)

try:
    with urllib.request.urlopen(req) as r:
        result = json.loads(r.read())
    
    print(f"\n✅ ORDER CREATED!")
    print(f"   WooCommerce Order ID: {result['id']}")
    print(f"   URL: {woo_url}/wp-admin/admin.php?page=wc-orders&action=edit&id={result['id']}")
    print(f"\n   Line Items in WooCommerce response:")
    for li in result.get("line_items", []):
        print(f"   - {li.get('name')}")
        print(f"     SKU: {li.get('sku') or '❌ MISSING'}")
        print(f"     variation_id: {li.get('variation_id') or '❌ MISSING'}")
        meta = li.get("meta_data") or []
        color = next((m for m in meta if "color" in str(m.get("key","")).lower() or "color" in str(m.get("display_key","")).lower()), None)
        print(f"     Color: {color.get('display_value') or color.get('value') if color else '❌ MISSING'}")

except urllib.error.HTTPError as e:
    err = e.read().decode()
    print(f"❌ WooCommerce push FAILED: {e.code}")
    print(err)
    exit(1)
