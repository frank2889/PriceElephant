# PriceElephant Backend Deployment

## Railway Deployment

This project is configured for automatic deployment to Railway.

### Required Environment Variables

```bash
# Database
DATABASE_HOST=
DATABASE_PORT=5432
DATABASE_NAME=
DATABASE_USER=
DATABASE_PASSWORD=
DATABASE_SSL=true

# Redis
REDIS_HOST=
REDIS_PORT=6379
REDIS_PASSWORD=

# Shopify
SHOPIFY_SHOP_DOMAIN=
SHOPIFY_ACCESS_TOKEN=
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=

# OpenAI
OPENAI_API_KEY=

# BrightData (optional)
BRIGHTDATA_USERNAME=
BRIGHTDATA_PASSWORD=
BRIGHTDATA_HOST=

# App Config
NODE_ENV=production
PORT=3000
```

### Deployment Steps

1. **Create Railway Account**: https://railway.app
2. **Add PostgreSQL**: Railway Dashboard → New → Database → PostgreSQL
3. **Add Redis**: Railway Dashboard → New → Database → Redis
4. **Deploy Backend**: 
   - New → GitHub Repo → Select PriceElephant
   - Railway auto-detects configuration
5. **Set Environment Variables**: Copy from Railway database services
6. **Deploy**: Railway automatically builds and deploys

### Database Migrations

Migrations run automatically on deployment via `railway.json` startCommand.

Manual migration: `railway run npm run db:migrate`

### Production Migration Options

**Option 1: Railway CLI (Recommended)**

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

**Option 2: Railway Dashboard**

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

**Option 3: Admin API Endpoint**

If ADMIN_TOKEN is set in Railway environment:

```bash
# Check migration status
curl https://web-production-2568.up.railway.app/api/v1/admin/migrate/status \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Run migrations
curl -X POST https://web-production-2568.up.railway.app/api/v1/admin/migrate/run \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Production URL

After deployment, Railway provides a public URL:
- Format: `https://priceelephant-production.up.railway.app`
- Use this URL in Shopify theme settings as API Base URL
