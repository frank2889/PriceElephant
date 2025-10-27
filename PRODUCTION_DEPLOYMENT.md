# Production Deployment Guide - Variant System

## Status: Ready for Deployment ✅

All variant system code has been pushed to GitHub and will auto-deploy to Railway.

## Deployment Steps

### Option 1: Railway CLI (Recommended)

```bash
cd backend

# Install Railway CLI if needed
npm install -g @railway/cli

# Login to Railway
railway login

# Link to project
railway link

# Run migration
railway run npx knex migrate:latest

# Verify migration
railway run node scripts/run-production-migration.js
```

### Option 2: Railway Dashboard

1. Go to https://railway.app/dashboard
2. Select PriceElephant project
3. Click on backend service
4. Go to "Variables" tab
5. Copy the DATABASE_URL value
6. Run locally:

```bash
cd backend
DATABASE_URL="<paste from Railway>" node scripts/run-production-migration.js
```

### Option 3: Admin API Endpoint

If ADMIN_TOKEN is set in Railway environment:

```bash
# Check migration status
curl https://web-production-2568.up.railway.app/api/v1/admin/migrate/status \
  -H "x-admin-token: YOUR_ADMIN_TOKEN"

# Run migration
curl https://web-production-2568.up.railway.app/api/v1/admin/migrate \
  -H "x-admin-token: YOUR_ADMIN_TOKEN"

# Verify schema
curl https://web-production-2568.up.railway.app/api/v1/admin/db/schema \
  -H "x-admin-token: YOUR_ADMIN_TOKEN"
```

## Verification

After migration, verify the variant columns exist:

```bash
# Test variant API
curl https://web-production-2568.up.railway.app/api/v1/products/1/convert-to-parent \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"option1_name":"Test","option1_value":"Value"}'

# Expected: Success or product not found (not route error)
```

## Expected Variant Columns

The migration adds these columns to the `products` table:

- ✅ `parent_product_id` (bigint, nullable, FK)
- ✅ `variant_title` (varchar 200)
- ✅ `variant_position` (integer, default 1)
- ✅ `option1_name` (varchar 100)
- ✅ `option1_value` (varchar 100)
- ✅ `option2_name` (varchar 100)
- ✅ `option2_value` (varchar 100)
- ✅ `option3_name` (varchar 100)
- ✅ `option3_value` (varchar 100)
- ✅ `is_parent_product` (boolean, default true)

Plus indexes on:
- `parent_product_id`
- `(shopify_customer_id, is_parent_product)`

## Post-Deployment Testing

1. **Test Manual Variant Creation:**
```bash
# Create a test product first
curl -X POST https://web-production-2568.up.railway.app/api/v1/products/create \
  -H "Content-Type: application/json" \
  -d '{
    "shopify_customer_id": 1,
    "product_name": "Test Product",
    "own_price": 19.99
  }'

# Get product ID from response, then convert to parent
curl -X POST https://web-production-2568.up.railway.app/api/v1/products/1/{PRODUCT_ID}/convert-to-parent \
  -H "Content-Type: application/json" \
  -d '{
    "option1_name": "Kleur",
    "option1_value": "Blauw"
  }'
```

2. **Test Variant-Aware Import:**
```bash
# Import Emmso feed with variant grouping
curl -X POST https://web-production-2568.up.railway.app/api/v1/products/import \
  -H "Content-Type: application/json" \
  -d '{
    "products": [...], 
    "enable_variant_grouping": true
  }'
```

3. **Verify in Database:**
Check that variants are created with proper parent-child relationships.

## Rollback Plan

If issues occur, rollback the migration:

```bash
# Railway CLI
railway run npx knex migrate:rollback

# Or manually via SQL
railway run psql $DATABASE_URL -c "
  ALTER TABLE products 
  DROP COLUMN IF EXISTS parent_product_id,
  DROP COLUMN IF EXISTS variant_title,
  DROP COLUMN IF EXISTS variant_position,
  DROP COLUMN IF EXISTS option1_name,
  DROP COLUMN IF EXISTS option1_value,
  DROP COLUMN IF EXISTS option2_name,
  DROP COLUMN IF EXISTS option2_value,
  DROP COLUMN IF EXISTS option3_name,
  DROP COLUMN IF EXISTS option3_value,
  DROP COLUMN IF EXISTS is_parent_product;
"
```

## Troubleshooting

### "Migration already run"
- ✅ Good! Variant columns already exist
- Verify with: `railway run node scripts/run-production-migration.js`

### "Cannot connect to database"
- Check DATABASE_URL is set in Railway environment
- Verify Railway service is running

### "Column already exists"
- Migration was partially run
- Manually complete or rollback and retry

## Next Steps After Deployment

1. ✅ Migration completed
2. ⏳ Update Shopify sync to create variants
3. ⏳ Add dashboard UI for variant management
4. ⏳ Import real customer products with variants
5. ⏳ Test end-to-end variant workflow

## Support

If you encounter issues:
1. Check Railway logs: https://railway.app/dashboard → Logs
2. Verify DATABASE_URL is accessible
3. Run migration script locally with production DATABASE_URL
4. Contact Railway support if database connection fails
