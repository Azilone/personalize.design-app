#!/bin/bash

# Get the encrypted token from the database
TOKEN_DATA=$(sqlite3 ./prisma/dev.sqlite "SELECT token_ciphertext, token_iv, token_auth_tag FROM shop_printify_integrations WHERE shop_id = 'personalized-design-dev-store-2.myshopify.com';")

if [ -z "$TOKEN_DATA" ]; then
  echo "No Printify integration found"
  exit 1
fi

# Note: We can't decrypt the token without the encryption key
# This script just shows what we would do

echo "Printify integration found"
echo "To test the product directly, you would need to:"
echo ""
echo "1. Get your Printify API token from the Printify dashboard"
echo "2. Run:"
echo "   curl -H 'Authorization: Bearer YOUR_TOKEN' \\"
echo "        -H 'User-Agent: personalize-design-app' \\"
echo "        'https://api.printify.com/v1/shops/26199821/products/6973498910406f1fc307d242.json'"
echo ""
echo "This will tell us if the product exists and is accessible."
