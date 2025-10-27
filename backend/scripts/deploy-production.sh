#!/bin/bash

# Deploy variant system to Railway production
# This script runs the database migration on Railway

echo "🚀 Deploying Variant System to Railway Production"
echo ""

# Check if railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

echo "1️⃣ Checking Railway login status..."
railway whoami || railway login

echo ""
echo "2️⃣ Linking to Railway project..."
railway link

echo ""
echo "3️⃣ Running database migrations on production..."
railway run npx knex migrate:latest --env production

echo ""
echo "4️⃣ Verifying migration status..."
railway run npx knex migrate:list --env production

echo ""
echo "5️⃣ Checking database schema..."
railway run node -e "const db = require('./config/database'); db('products').columnInfo().then(cols => { console.log('Products table columns:'); Object.keys(cols).forEach(c => console.log('  -', c)); process.exit(0); });"

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "  1. Test variant API on production"
echo "  2. Import test products with variants"
echo "  3. Verify Shopify sync"
