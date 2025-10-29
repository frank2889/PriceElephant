#!/bin/bash
# Run migration on Railway database

set -e

echo "🚂 Running migration on Railway database..."
echo ""

# Railway production database URL (from your env)
DATABASE_URL="postgresql://postgres:vWFOOkOwJzjvmtQCtUKhpvlKQovZVZjH@tramway.proxy.rlwy.net:12477/railway"

# Run Knex migration
cd /Users/Frank/Documents/PriceElephant/backend

echo "📦 Installing dependencies..."
npm install --silent

echo "🔄 Running pending migrations..."
DATABASE_URL="$DATABASE_URL" npx knex migrate:latest

echo ""
echo "✅ Migration complete!"
echo ""
echo "Checking if bundle_info column exists..."
DATABASE_URL="$DATABASE_URL" npx knex migrate:status
