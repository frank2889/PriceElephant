# Bright Data Setup Guide

## Wat is Bright Data?

Bright Data (voorheen Luminati) is de #1 enterprise proxy service voor web scraping:
- **Residential proxies**: Echte ISP IP-adressen (niet datacenter)
- **Geo-targeting**: Nederlandse IP's voor .nl websites
- **Anti-detection**: Bypassed Cloudflare, Akamai, PerimeterX
- **99.9% uptime**: Enterprise-grade infrastructure

## Pricing

### Trial Account (7 dagen gratis)
- $500 credit
- ~40GB residential traffic
- Genoeg voor ~10.000 scrapes
- **Perfecte voor testen**

### Production Plans
| Plan | Prijs | Traffic | Use Case |
|------|-------|---------|----------|
| Starter | $500/maand | 40GB | 100-500 producten |
| Growth | $1000/maand | 100GB | 500-2000 producten |
| Business | $3000/maand | 300GB | 2000-10000 producten |
| Enterprise | Custom | Unlimited | 10k+ producten |

**Calculator:** 
- 1 scrape = ~4MB traffic (met images)
- 40GB = ~10.000 scrapes
- 500 producten × 4 retailers × 2 checks/dag = 4.000 scrapes/dag
- = ~120k scrapes/maand = **$600-800/maand**

## Setup Instructions

### 1. Account Aanmaken

1. Ga naar https://brightdata.com
2. Klik "Start Free Trial"
3. Selecteer: **Residential Proxies**
4. Target country: **Netherlands**

### 2. Proxy Zone Aanmaken

1. Dashboard → **Proxy Products** → **Residential Proxies**
2. Klik "Add Zone"
3. Settings:
   - **Zone name**: `priceelephant-nl`
   - **Type**: Residential
   - **Country**: Netherlands
   - **Session type**: Sticky (voor consistency)
   - **Session duration**: 10 minutes

4. Klik "Save"

### 3. Credentials Ophalen

1. Ga naar jouw zone: `priceelephant-nl`
2. Klik "Access Parameters"
3. Kopieer:
   - **Username**: `brd-customer-hl_XXXXXXX-zone-priceelephant_nl`
   - **Password**: `XXXXXXXXXXX`
   - **Host**: `brd.superproxy.io`
   - **Port**: `22225`

### 4. Credentials Toevoegen

Voeg toe aan `/Users/Frank/Documents/PriceElephant/backend/.env`:

```bash
# Bright Data Proxy
BRIGHTDATA_USERNAME=brd-customer-hl_XXXXXXX-zone-priceelephant_nl
BRIGHTDATA_PASSWORD=XXXXXXXXXXX
BRIGHTDATA_HOST=brd.superproxy.io
BRIGHTDATA_PORT=22225
BRIGHTDATA_COUNTRY=nl
```

### 5. Test Connection

```bash
cd /Users/Frank/Documents/PriceElephant/backend

# Test proxy connection
node -e "
const BrightDataProxy = require('./utils/brightdata-proxy');
const proxy = new BrightDataProxy();
proxy.testConnection().then(r => console.log(r));
"
```

**Expected output:**
```
✅ Bright Data connected successfully
   IP: 213.127.45.198
   Country: NL
   ISP: KPN B.V.
```

### 6. Test Production Scraper

```bash
# Scrape 1 product (Apple AirPods)
node backend/crawlers/production-scraper.js
```

**Expected output:**
```
🚀 Starting browser with Bright Data proxy...
✅ Browser initialized with Dutch locale & Bright Data proxy

🎯 Scraping product 36 (EAN: 194253398578)

🔍 Scraping Coolblue for EAN: 194253398578
✅ Coolblue: €274.99 ✓

🔍 Scraping Bol.com for EAN: 194253398578
✅ Bol.com: €284.99 ✓

📊 RESULTS:
   Success: 2/4
   Failed: 2

   Prices:
   coolblue: €274.99 ✓
   bol: €284.99 ✓
   amazon: ❌ Failed
   mediamarkt: ❌ Failed
```

### 7. API Endpoint Testen

```bash
# Test via Railway production
curl -X POST https://web-production-2568.up.railway.app/api/v1/scraper/test

# Run scraper voor customer 1
curl -X POST https://web-production-2568.up.railway.app/api/v1/scraper/run \
  -H "Content-Type: application/json" \
  -d '{"customerId": 1, "limit": 5}'
```

## Production Deployment

### Railway Environment Variables

1. Railway Dashboard → **web-production-2568** → **Variables**
2. Add:
   ```
   BRIGHTDATA_USERNAME=brd-customer-hl_XXX-zone-priceelephant_nl
   BRIGHTDATA_PASSWORD=XXXXXXXXXXX
   BRIGHTDATA_HOST=brd.superproxy.io
   BRIGHTDATA_PORT=22225
   BRIGHTDATA_COUNTRY=nl
   ```

3. Redeploy: Railway auto-deploys bij git push

### Verify Deployment

```bash
# Test connection via Railway
curl -X POST https://web-production-2568.up.railway.app/api/v1/scraper/test

# Should return:
{
  "success": true,
  "message": "Bright Data connected successfully",
  "proxy": {
    "ip": "213.127.45.198",
    "country": "NL",
    "isp": "KPN B.V."
  }
}
```

## Usage Examples

### Scrape Specific Products

```javascript
const ProductionScraper = require('./crawlers/production-scraper');

const scraper = new ProductionScraper();
await scraper.initBrowser();

// Scrape Apple AirPods van alle retailers
const results = await scraper.scrapeAllRetailers(36, '194253398578');

console.log(results);
// {
//   product_id: 36,
//   ean: '194253398578',
//   retailers: {
//     coolblue: { success: true, price: 274.99, in_stock: true },
//     bol: { success: true, price: 284.99, in_stock: true }
//   },
//   success_count: 2,
//   failed_count: 2
// }

await scraper.close();
```

### Schedule Scraping (Cron Job)

```javascript
// Run scraper elke 6 uur
const cron = require('node-cron');

cron.schedule('0 */6 * * *', async () => {
  console.log('🕐 Running scheduled scrape...');
  
  const scraper = new ProductionScraper();
  await scraper.initBrowser();
  
  // Get all active products
  const products = await db('products')
    .where({ active: true })
    .whereNotNull('product_ean')
    .limit(100);
  
  for (const product of products) {
    await scraper.scrapeAllRetailers(product.id, product.product_ean);
  }
  
  await scraper.close();
});
```

## Monitoring & Costs

### Check Usage

1. Bright Data Dashboard → **Statistics**
2. View:
   - Total traffic used (GB)
   - Requests count
   - Success rate
   - Cost this month

### Alerts

Set up alerts:
1. Dashboard → **Settings** → **Notifications**
2. Add alert: "Traffic > 35GB" (90% of 40GB)
3. Email: frank@webelephant.nl

### Cost Optimization

**Reduce costs:**
- ✅ Cache results voor 6-12 uur
- ✅ Scrape alleen producten die customers tracken
- ✅ Skip out-of-stock producten
- ✅ Gebruik session rotation (sticky sessions)
- ✅ Batch requests per retailer

**Example:**
```javascript
// Inefficient (4000 scrapes/dag × 4MB = 16GB/dag = $1200/maand)
scrape.allRetailers(productId);

// Efficient (cache 12h = 2000 scrapes/dag × 4MB = 8GB/dag = $600/maand)
const cached = await redis.get(`prices:${productId}`);
if (cached) return cached;
```

## Troubleshooting

### Error: "Proxy authentication failed"
- Check BRIGHTDATA_USERNAME en PASSWORD in .env
- Verify zone is active in dashboard

### Error: "Timeout"
- Increase timeout: `{ timeout: 60000 }` (60 sec)
- Check Bright Data status page: https://status.brightdata.com

### Error: "Too many requests"
- Add rate limiting: `await sleep(2000)` between requests
- Use session rotation: `proxy.rotateSession()`

### Low Success Rate
- Check selectors zijn nog geldig
- Test in browser first
- Enable screenshots: `await page.screenshot({ path: 'debug.png' })`

## Support

- **Bright Data Support**: support@brightdata.com (24/7)
- **Documentation**: https://docs.brightdata.com
- **Status Page**: https://status.brightdata.com
- **Community**: https://discourse.brightdata.com

## Next Steps

✅ Bright Data setup
✅ Test connection
✅ Test scraper locally
⏳ Deploy to Railway
⏳ Schedule cron jobs
⏳ Monitor usage & costs
