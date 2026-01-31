#!/bin/bash

set -euo pipefail

if [ -z "${TEMP_DEV_PRINTIFY_API_KEY:-}" ]; then
  echo "TEMP_DEV_PRINTIFY_API_KEY is required"
  exit 1
fi

PRINTIFY_SHOP_ID=${PRINTIFY_SHOP_ID:-""}
PRINTIFY_PRODUCT_ID=${PRINTIFY_PRODUCT_ID:-""}
PRINTIFY_VARIANT_ID=${PRINTIFY_VARIANT_ID:-""}

COUNTRY=${PRINTIFY_SHIP_COUNTRY:-"US"}
REGION=${PRINTIFY_SHIP_REGION:-"CA"}
ZIP=${PRINTIFY_SHIP_ZIP:-"94105"}
CITY=${PRINTIFY_SHIP_CITY:-"San Francisco"}
ADDRESS1=${PRINTIFY_SHIP_ADDRESS1:-"1 Market St"}
FIRST_NAME=${PRINTIFY_SHIP_FIRST_NAME:-"Test"}
LAST_NAME=${PRINTIFY_SHIP_LAST_NAME:-"User"}
EMAIL=${PRINTIFY_SHIP_EMAIL:-"test@example.com"}

auth_header="Authorization: Bearer ${TEMP_DEV_PRINTIFY_API_KEY}"
ua_header="User-Agent: personalize-design-app"

echo "Fetching shops..."
shops_json=$(curl -sS -H "$auth_header" -H "$ua_header" "https://api.printify.com/v1/shops.json")

if [ -z "$PRINTIFY_SHOP_ID" ]; then
  PRINTIFY_SHOP_ID=$(echo "$shops_json" | python - <<'PY'
import json,sys
data=json.load(sys.stdin)
shops=data if isinstance(data,list) else data.get("data",[])
if not shops:
  print("")
  sys.exit(0)
print(shops[0].get("id",""))
PY
)
fi

if [ -z "$PRINTIFY_SHOP_ID" ]; then
  echo "No Printify shop found. Set PRINTIFY_SHOP_ID manually."
  exit 1
fi

echo "Using Printify shop: ${PRINTIFY_SHOP_ID}"

if [ -z "$PRINTIFY_PRODUCT_ID" ]; then
  echo "PRINTIFY_PRODUCT_ID is required to continue."
  exit 1
fi

echo "Fetching product details..."
product_json=$(curl -sS -H "$auth_header" -H "$ua_header" "https://api.printify.com/v1/shops/${PRINTIFY_SHOP_ID}/products/${PRINTIFY_PRODUCT_ID}.json")
echo "$product_json" | python - <<'PY'
import json,sys
data=json.load(sys.stdin)
print("Product:", data.get("id"), data.get("title"))
print("Blueprint:", data.get("blueprint_id"), "Print provider:", data.get("print_provider_id"))
variants=data.get("variants",[])
print("Variants:", len(variants))
PY

BLUEPRINT_ID=$(echo "$product_json" | python - <<'PY'
import json,sys
data=json.load(sys.stdin)
print(data.get("blueprint_id",""))
PY
)
PRINT_PROVIDER_ID=$(echo "$product_json" | python - <<'PY'
import json,sys
data=json.load(sys.stdin)
print(data.get("print_provider_id",""))
PY
)

if [ -z "$PRINTIFY_VARIANT_ID" ]; then
  PRINTIFY_VARIANT_ID=$(echo "$product_json" | python - <<'PY'
import json,sys
data=json.load(sys.stdin)
variants=data.get("variants",[])
enabled=[v for v in variants if v.get("is_enabled")]
variant=(enabled[0] if enabled else (variants[0] if variants else {}))
print(variant.get("id",""))
PY
)
fi

if [ -z "$PRINTIFY_VARIANT_ID" ]; then
  echo "No variant found for product."
  exit 1
fi

echo "Using variant: ${PRINTIFY_VARIANT_ID}"

echo "Fetching variant placeholders (print areas)..."
curl -sS -H "$auth_header" -H "$ua_header" "https://api.printify.com/v1/catalog/blueprints/${BLUEPRINT_ID}/print_providers/${PRINT_PROVIDER_ID}/variants.json?show-out-of-stock=1" \
  | python - <<'PY'
import json,sys
data=json.load(sys.stdin)
variants=data if isinstance(data,list) else data.get("data") or data.get("variants") or []
variant=[v for v in variants if str(v.get("id"))==str(sys.argv[1])]
variant=variant[0] if variant else None
print("Placeholders:")
placeholders=variant.get("placeholders") if variant else None
def norm(ph):
  if isinstance(ph,list):
    return ph
  if isinstance(ph,dict):
    out=[]
    for v in ph.values():
      if isinstance(v,list):
        out.extend(v)
      elif isinstance(v,dict):
        out.append(v)
    return out
  return []
for p in norm(placeholders):
  print("-", p.get("position"), p.get("width"), p.get("height"))
PY
  "$PRINTIFY_VARIANT_ID"

echo "Calculating shipping methods..."
curl -sS -H "$auth_header" -H "$ua_header" -H "Content-Type: application/json" \
  -d "{\"line_items\":[{\"product_id\":\"${PRINTIFY_PRODUCT_ID}\",\"variant_id\":${PRINTIFY_VARIANT_ID},\"quantity\":1}],\"address_to\":{\"first_name\":\"${FIRST_NAME}\",\"last_name\":\"${LAST_NAME}\",\"email\":\"${EMAIL}\",\"address1\":\"${ADDRESS1}\",\"city\":\"${CITY}\",\"region\":\"${REGION}\",\"zip\":\"${ZIP}\",\"country\":\"${COUNTRY}\"}}" \
  "https://api.printify.com/v1/shops/${PRINTIFY_SHOP_ID}/orders/shipping.json" \
  | python - <<'PY'
import json,sys
data=json.load(sys.stdin)
methods=data if isinstance(data,list) else data.get("data",[])
print("Shipping methods:")
for m in methods:
  print("-", m.get("id"), m.get("name"), m.get("rate") or m.get("cost") or (m.get("price") or {}).get("amount"))
PY

echo "Done."
