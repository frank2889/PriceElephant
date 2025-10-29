#!/bin/bash
# Quick theme file upload via Shopify Admin API
# Uploads only changed JavaScript file

THEME_ID="175374053592"
SHOP_DOMAIN="priceelephant.myshopify.com"
ACCESS_TOKEN="${SHOPIFY_ACCESS_TOKEN}"

echo "📤 Uploading priceelephant-dashboard.js to Shopify..."

# Upload the JavaScript file
curl -X PUT "https://${SHOP_DOMAIN}/admin/api/2024-10/themes/${THEME_ID}/assets.json" \
  -H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "asset": {
      "key": "assets/priceelephant-dashboard.js",
      "attachment": "'$(base64 -i theme/assets/priceelephant-dashboard.js | tr -d '\n')'"
    }
  }'

echo ""
echo "✅ Theme file uploaded!"
