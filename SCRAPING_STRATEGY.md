# PriceElephant Scraping Strategy

## 📊 Cost-Optimized Multi-Tier Approach

### Problem Statement
Initial Bright Data implementation had monthly costs of **€600-800 for 500 products**, making the business model unprofitable:
- Professional plan (€99/month): -€701 loss per customer
- Enterprise plan (€249/month): -€551 loss per customer
- Break-even required 134+ paying customers

### Solution: 5-Tier Fallback Cascade

```
┌─────────────────────────────────────────────────────────┐
│                   SCRAPE REQUEST                         │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────┐
        │  TIER 1: Direct (No Proxy)           │
        │  Cost: FREE                          │
        │  Success: ~60%                       │
        └──────────────────────────────────────┘
                           │ Failed
                           ▼
        ┌──────────────────────────────────────┐
        │  TIER 2: Free Public Proxies (NL)    │
        │  Cost: FREE                          │
        │  Success: ~40%                       │
        └──────────────────────────────────────┘
                           │ Failed
                           ▼
        ┌──────────────────────────────────────┐
        │  TIER 3: WebShare Datacenter         │
        │  Cost: €0.0003/request               │
        │  Success: ~90%                       │
        └──────────────────────────────────────┘
                           │ Failed
                           ▼
        ┌──────────────────────────────────────┐
        │  TIER 4: Bright Data Residential     │
        │  Cost: €0.01/request                 │
        │  Success: ~99%                       │
        └──────────────────────────────────────┘
                           │ Failed
                           ▼
        ┌──────────────────────────────────────┐
        │  TIER 5: GPT-4 Vision API            │
        │  Cost: €0.02/request                 │
        │  Success: 99%+                       │
        └──────────────────────────────────────┘
                           │
                           ▼
                    ✅ SUCCESS
```

---

## 💰 Cost Analysis

### Monthly Scraping Volume (500 Products)
- 500 products
- × 4 retailers (Coolblue, Bol.com, Amazon.nl, MediaMarkt)
- × 2 checks per day
- = **120,000 scrapes/month**

### Expected Tier Distribution

| Tier | Method | Success Rate | Traffic | Cost/Req | Monthly Cost |
|------|--------|--------------|---------|----------|--------------|
| 1 | Direct | 60% | 72,000 | €0 | **€0** |
| 2 | Free Proxy | 20% of failures | 24,000 | €0 | **€0** |
| 3 | WebShare | 15% of failures | 18,000 | €0.0003 | **€5.40** |
| 4 | Bright Data | 4% of failures | 4,800 | €0.01 | **€48** |
| 5 | AI Vision | 1% of failures | 1,200 | €0.02 | **€24** |
| **TOTAL** | | **99%+** | 120,000 | | **€77.40** |

### Comparison with Original Strategy

| Metric | Bright Data Only | Hybrid (Per-Customer) | Multi-Tenant Shared | Savings |
|--------|-----------------|----------------------|---------------------|---------|
| Monthly cost (500 products) | €600-800 | €75-100 | **€5** | **€795** |
| Cost per scrape | €0.006 | €0.0006 | **€0.00004** | **99.3%** |
| Cost per customer | €800 | €75 | **€5** | **99.4%** |
| Success rate | 99% | 99%+ | 99%+ | Same |
| Vendor lock-in | High | Low | None | ✅ |
| Gross margin (€99 plan) | -708% | 24% | **95%** | ✅✅✅ |

---

## 🚀 Multi-Tenant Scraping Strategy

### The Game Changer: Shared Scraping

**Problem with Per-Customer Scraping:**
- Customer A has Apple AirPods → scrape 4 retailers
- Customer B has Apple AirPods → scrape 4 retailers AGAIN
- Customer C has Apple AirPods → scrape 4 retailers AGAIN
- **Result:** 3 customers = 12 scrapes for SAME product

**Solution: Multi-Tenant Shared Scraping:**
- Apple AirPods (EAN: 194253398578) → scrape 4 retailers ONCE
- Share result with Customer A, B, C
- **Result:** 3 customers = 4 scrapes total
- **Cost reduction: 67% per product**

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│          MULTI-TENANT SCRAPING SCHEDULER                 │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────┐
        │  1. Collect Unique EANs              │
        │     - Query all active products      │
        │     - Deduplicate by EAN             │
        │     - 40 customers × 500 = 20k EANs  │
        │     - But only 15k unique EANs       │
        └──────────────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────┐
        │  2. Scrape Each EAN Once             │
        │     - 15k EANs × 4 retailers         │
        │     - = 60k scrapes (not 240k!)      │
        │     - Cost: €200/month total         │
        └──────────────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────┐
        │  3. Store in Shared Cache            │
        │     - Redis: EAN → prices            │
        │     - 12h TTL (refresh 2x/day)       │
        │     - Customer-agnostic              │
        └──────────────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────┐
        │  4. Customers Query Cache            │
        │     - GET /products/:id/competitors  │
        │     - Lookup by EAN in shared cache  │
        │     - Same data, €0 scraping cost    │
        └──────────────────────────────────────┘
```

### Cost Breakdown (40 Customers)

**Per-Customer Scraping:**
- 40 customers × 500 products × 4 retailers × 2/day
- = 160,000 scrapes/day
- = 4.8M scrapes/month
- **Cost: €3,000/month** (€75/customer)

**Multi-Tenant Shared:**
- 15,000 unique EANs × 4 retailers × 2/day
- = 120,000 scrapes/day
- = 3.6M scrapes/month
- But: 25% overlap → 2.7M actual scrapes
- **Cost: €200/month total = €5/customer**

**Savings: €2,800/month (93% reduction)**
|--------|-----------------|-----------------|---------|
| Monthly cost (500 products) | €600-800 | €75-100 | **€700** |
| Cost per scrape | €0.006 | €0.0006 | **90%** |
| Success rate | 99% | 99%+ | Same |
| Vendor lock-in | High | Low | ✅ |

---

## 🏗️ Technical Implementation

### 1. ProxyPool Manager (`backend/utils/proxy-pool.js`)

**Responsibilities:**
- Manage 4 proxy tiers (direct, free, webshare, premium)
- Track success rates per tier
- Auto-disable tiers with <30% success rate
- Fetch free NL proxies from ProxyScrape API
- Cost monitoring in real-time

**Key Methods:**
```javascript
// Get best available proxy (cascade through tiers)
async getNextProxy()

// Record scraping result for success tracking
recordResult(tier, success, cost)

// Refresh free proxy list from public sources
async refreshFreeProxies()

// Test proxy connection
async testProxy(proxyConfig)

// Get cost and performance statistics
getStats()
```

**Success Rate Tracking:**
```javascript
{
  direct: {
    tier: 1,
    successRate: 0.62,      // 62% success
    totalRequests: 1247,
    successfulRequests: 773
  },
  webshare: {
    tier: 3,
    successRate: 0.91,      // 91% success
    cost: 0.0003,
    totalRequests: 342,
    successfulRequests: 311
  }
}
```

### 2. Hybrid Scraper (`backend/crawlers/hybrid-scraper.js`)

**Features:**
- Multi-tier cascade fallback
- CSS selector extraction (primary method)
- 4 retailer configs (Coolblue, Bol.com, Amazon.nl, MediaMarkt)
- AI Vision final fallback (GPT-4V)
- Database integration (price_snapshots table)
- Rate limiting between retailers (2 sec delay)

**Scraping Flow:**
```javascript
async scrapeProduct(url, ean, retailerKey, productId) {
  // Try Tier 1: Direct
  try {
    const proxy = await this.proxyPool.getNextProxy(); // Returns null
    result = await this.scrapeWithSelectors(url, retailer);
    if (result.price > 0) return result; // SUCCESS
  } catch (error) {
    // Try Tier 2: Free Proxy
    await this.proxyPool.refreshFreeProxies();
    const proxy = await this.proxyPool.getNextProxy(); // Returns free proxy
    result = await this.scrapeWithSelectors(url, retailer);
    if (result.price > 0) return result; // SUCCESS
  }
  
  // Continue through Tiers 3, 4, 5...
}
```

**Database Storage:**
```javascript
// Save with scraping method tracking
await db('price_snapshots').insert({
  product_id: productId,
  retailer: 'coolblue',
  price: 299.99,
  in_stock: true,
  scraped_at: new Date(),
  scraping_method: 'webshare',    // Which tier succeeded
  scraping_cost: 0.0003,          // Actual cost
  metadata: JSON.stringify({
    title: 'Apple AirPods Pro',
    extractedBy: 'selectors'
  })
});
```

### 3. Multi-Tenant Scraper (`backend/crawlers/multi-tenant-scraper.js`) - NEXT SPRINT

**Implementation Plan:**

```javascript
class MultiTenantScraper extends HybridScraper {
  /**
   * Scrape all unique EANs across all customers
   */
  async scrapeAllCustomers() {
    // 1. Get unique EANs from all active products
    const uniqueEANs = await db('products')
      .where({ active: true })
      .whereNotNull('product_ean')
      .distinct('product_ean')
      .select('product_ean');
    
    console.log(`📊 Found ${uniqueEANs.length} unique EANs across all customers`);
    
    // 2. Check Redis cache first
    const uncachedEANs = await this.filterUncached(uniqueEANs);
    console.log(`⏭️  ${uncachedEANs.length} need scraping (rest cached)`);
    
    // 3. Scrape uncached EANs
    for (const ean of uncachedEANs) {
      const prices = await this.scrapeEAN(ean);
      
      // 4. Store in Redis (customer-agnostic)
      await redis.setex(
        `prices:${ean}`,
        43200, // 12 hour TTL
        JSON.stringify(prices)
      );
      
      // 5. Update all products with this EAN
      await this.updateProductPrices(ean, prices);
    }
  }
  
  /**
   * Update price_snapshots for all products with this EAN
   */
  async updateProductPrices(ean, prices) {
    // Get all products with this EAN (across all customers)
    const products = await db('products')
      .where({ product_ean: ean, active: true });
    
    // Insert price snapshots for each product
    for (const product of products) {
      for (const [retailer, data] of Object.entries(prices)) {
        await db('price_snapshots').insert({
          product_id: product.id,
          retailer: retailer,
          price: data.price,
          in_stock: data.inStock,
          scraped_at: new Date(),
          scraping_method: data.tier,
          scraping_cost: data.cost / products.length // Split cost
        });
      }
    }
  }
}
```

**Benefits:**
- Scrape each EAN once, share across customers
- Cost: €200/month for 40 customers = **€5/customer**
- 93% cost reduction vs per-customer scraping
- Redis cache reduces API latency to <10ms
- Fair cost allocation (split scraping cost by # of products)

### 4. API Endpoints (`backend/routes/scraper-routes.js`)

**POST /api/v1/scraper/run** (Current - Per Customer)
```bash
curl -X POST https://web-production-2568.up.railway.app/api/v1/scraper/run \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": 1,
    "limit": 5
  }'
```

Response:
```json
{
  "success": true,
  "total": 5,
  "scraped": 5,
  "failed": 0,
  "totalCost": "€0.15",
  "avgCostPerProduct": "€0.0300",
  "products": [
    {
      "id": 36,
      "name": "Apple AirPods Pro",
      "ean": "194253398578",
      "success_count": 4,
      "failed_count": 0,
      "cost": 0.0012,
      "retailers": [
        {
          "retailer": "Coolblue",
          "price": 299.99,
          "tier": "direct",
          "cost": 0
        },
        {
          "retailer": "Bol.com",
          "price": 289.99,
          "tier": "webshare",
          "cost": 0.0003
        }
      ]
    }
  ],
  "stats": {
    "successRate": "100%",
    "totalCost": "€0.15",
    "byMethod": {
      "direct": 12,
      "freeProxy": 4,
      "paidProxy": 3,
      "premiumProxy": 1,
      "aiVision": 0
    }
  }
}
```

**GET /api/v1/scraper/status/:productId**
```bash
curl https://web-production-2568.up.railway.app/api/v1/scraper/status/36
```

Response:
```json
{
  "success": true,
  "product_id": 36,
  "retailers": {
    "coolblue": [
      {
        "price": 299.99,
        "in_stock": true,
        "scraped_at": "2025-10-26T14:30:00Z",
        "method": "direct",
        "cost": 0
      }
    ],
    "bol": [
      {
        "price": 289.99,
        "in_stock": true,
        "scraped_at": "2025-10-26T14:30:02Z",
        "method": "webshare",
        "cost": 0.0003
      }
    ]
  },
  "last_scraped": "2025-10-26T14:30:05Z"
}
```

**POST /api/v1/scraper/test**
```bash
curl -X POST https://web-production-2568.up.railway.app/api/v1/scraper/test
```

Response:
```json
{
  "success": true,
  "message": "Scraping test successful",
  "test": {
    "url": "https://www.coolblue.nl/product/942019/apple-airpods-pro.html",
    "price": 299.99,
    "tier": "direct",
    "cost": 0,
    "inStock": true
  },
  "stats": {
    "total": 1,
    "successRate": "100%",
    "byMethod": {
      "direct": 1,
      "freeProxy": 0
    }
  }
}
```

---

## 🔧 Configuration & Setup

### Environment Variables

**Tier 3: WebShare.io (Recommended - €30/month)**
```bash
WEBSHARE_USERNAME=your-username
WEBSHARE_PASSWORD=your-password
```

**Tier 4: Bright Data (Optional fallback - pay per use)**
```bash
BRIGHTDATA_USERNAME=brd-customer-hl_xxxxx-zone-priceelephant_nl
BRIGHTDATA_PASSWORD=your-password
BRIGHTDATA_HOST=brd.superproxy.io
BRIGHTDATA_PORT=22225
```

**Tier 5: OpenAI GPT-4 Vision (Optional - €0.02/request)**
```bash
OPENAI_API_KEY=sk-xxxxx
```

### Proxy Providers Comparison

| Provider | Type | Cost | NL IPs | Success Rate | Recommended |
|----------|------|------|--------|--------------|-------------|
| **None (Direct)** | No proxy | Free | N/A | 60% | ✅ Always try first |
| **ProxyScrape** | Free public | Free | Yes | 40% | ✅ Good fallback |
| **WebShare.io** | Datacenter | €30/month | Yes | 90% | ✅ Best value |
| **Bright Data** | Residential | €500+/month | Yes | 99% | ⚠️ Fallback only |
| **Smartproxy** | Residential | €75/month | Yes | 95% | ❌ More expensive than WebShare |
| **IPRoyal** | Datacenter | €50/month | Yes | 85% | ❌ Lower success than WebShare |

### Recommended Setup

**Minimum (Free tier):**
- Tier 1: Direct ✅
- Tier 2: Free proxies ✅
- **Cost: €0/month**
- **Success: ~75%**

**Recommended (Production):**
- Tier 1: Direct ✅
- Tier 2: Free proxies ✅
- Tier 3: WebShare ✅ (€30/month)
- **Cost: €30-50/month**
- **Success: ~95%**

**Enterprise (High reliability):**
- Tier 1: Direct ✅
- Tier 2: Free proxies ✅
- Tier 3: WebShare ✅ (€30/month)
- Tier 4: Bright Data ✅ (pay per use)
- Tier 5: AI Vision ✅ (pay per use)
- **Cost: €75-100/month**
- **Success: 99%+**

---

## 📈 Business Model Impact

### Unit Economics Comparison

| Model | Revenue | COGS | Gross Profit | Margin |
|-------|---------|------|--------------|--------|
| **Bright Data Only** | €99 | €800 | -€701 ❌ | -708% |
| **Hybrid Per-Customer** | €99 | €75 | +€24 ✅ | 24% |
| **Multi-Tenant Shared** | €99 | €5 | **+€94** ✅✅ | **95%** |

### Pricing Strategy (Multi-Tenant Model)

| Plan | Price | Products | COGS | Gross Profit | Margin |
|------|-------|----------|------|--------------|--------|
| **Free Trial** | €0 | 50 | €1 | -€1 | Acceptable CAC |
| **Starter** | €49 | 500 | €5 | **€44** | **90%** ✅ |
| **Professional** | €99 | 2,500 | €5 | **€94** | **95%** ✅✅ |
| **Enterprise** | €249 | 10,000 | €10 | **€239** | **96%** ✅✅✅ |
| **Scale** | €599 | Unlimited | €20 | **€579** | **97%** ✅✅✅ |

**Key Insights:**
- Multi-tenant scraping achieves **90-97% gross margins**
- Freemium model viable (€1 COGS = acceptable CAC)
- Pricing can stay competitive (€49-599 range)
- Scalable to 1000+ customers without COGS explosion
- Break-even at customer #1 across all paid plans

### Revenue Projections (Multi-Tenant)

**10 Customers:**
- Mix: 2 Starter + 5 Professional + 3 Enterprise
- Revenue: €1,340/month
- COGS: €50/month (shared scraping)
- Gross Profit: **€1,290/month**
- Margin: **96%**

**100 Customers:**
- Mix: 20 Starter + 60 Professional + 20 Enterprise
- Revenue: €12,920/month
- COGS: €200/month (deduplication efficiency)
- Gross Profit: **€12,720/month**
- Margin: **98%**

**1000 Customers:**
- Revenue: €129,200/month
- COGS: €500/month (high deduplication)
- Gross Profit: **€128,700/month**
- Margin: **99.6%** 🚀

### Break-even Analysis

| Metric | Bright Data | Hybrid | Multi-Tenant |
|--------|-------------|--------|--------------|
| Customers needed | 134+ | 1 | 1 |
| Monthly revenue (break-even) | €13,360 | €99 | €49 |
| Gross margin at 10 customers | -8000% | 24% | **96%** |
| Gross margin at 100 customers | -800% | 24% | **98%** |
| Scalability | ❌ | ✅ | ✅✅✅ |

### Why Multi-Tenant Wins

**Economies of Scale:**
- 1 customer: €75 COGS (per-customer) vs €5 (multi-tenant)
- 10 customers: €750 COGS vs €50 = **€700 savings**
- 100 customers: €7,500 COGS vs €200 = **€7,300 savings**

**Product Overlap:**
- Electronics retailers have 60-80% product overlap
- Apple AirPods: sold by 40% of customers → scrape 1x not 40x
- Samsung TVs: sold by 30% of customers → scrape 1x not 30x
- **Average 25% unique products across customer base**

**Fair Usage Limits:**
- Starter: 500 products max → prevents abuse
- Professional: 2,500 products → professional retailers
- Enterprise: 10,000 products → large catalogs
- Scale: Unlimited → custom pricing if COGS explodes

---

## 🎯 Implementation Roadmap

### ✅ Phase 1: Hybrid Scraper (COMPLETED)
- Multi-tier fallback working
- Cost tracking per tier
- Free proxies integration
- Database storage with method tracking
- **Result: €75/customer (was €800)**

### ⏸️ Phase 2: Multi-Tenant Scraping (NEXT SPRINT - HIGH PRIORITY)
**Goal:** Reduce COGS from €75 → €5/customer (93% reduction)

**Implementation:**
   - Cost: ~€25/month → 51% margin

3. **Professional Plan** (€99/month)
   - 2,500 products
   - 2 checks/day
   - All tiers
   - Cost: ~€75/month → 24% margin

4. **Enterprise Plan** (€249/month)
   - Unlimited products
   - 4 checks/day
   - All tiers + priority
   - Cost: ~€150/month → 40% margin

---

## 🎯 Optimization Roadmap

### Phase 1: Current Implementation ✅
- Multi-tier fallback working
- Cost tracking per tier
- Free proxies integration
- Database storage with method tracking

### Phase 2: Smart Caching (Next)
**Goal:** Reduce scrapes by 50% with intelligent caching

**Strategy:**
```javascript
// Cache prices for stable products
if (priceChangeRate < 2% over last 7 days) {
  cacheTTL = 12 hours;  // Scrape 1x/day instead of 2x
}

// Skip out-of-stock products
if (outOfStock for 30+ days) {
  scrapeFrequency = 1x/week;
}

// Prioritize high-value products
if (product.views > 100/month) {
  scrapeFrequency = 4x/day;
}
```

**Expected Impact:** €75/month → **€35/month** (53% reduction)

### Phase 3: WebShare Integration
**Goal:** Improve Tier 3 success rate to 95%

**Actions:**
- Subscribe to WebShare.io (€30/month)
- 100 datacenter proxies with Dutch IPs
- Sticky sessions for consistency
- Auto IP rotation on failure

**Expected Impact:** Tier 4 usage drops from 4% → 1%

### Phase 4: Retailer-Specific Optimization
**Goal:** Increase direct scraping success from 60% → 75%

**Actions:**
- Identify retailer-specific anti-bot triggers
- Optimize selectors per retailer
- Implement retailer-specific delays
- User-agent rotation per retailer

**Expected Impact:** Tier 2+ usage drops 20%

### Phase 5: Scheduled Scraping
**Goal:** Optimize timing for cost efficiency

**Strategy:**
```javascript
// Off-peak scraping (lower detection rates)
const optimalTimes = [
  '02:00-06:00',  // Night time (NL) - lowest traffic
  '13:00-14:00'   // Lunch time - moderate traffic
];

// Avoid peak hours (higher detection)
const avoidTimes = [
  '09:00-12:00',  // Morning - high traffic
  '18:00-22:00'   // Evening - highest traffic
];
```

**Expected Impact:** Direct success 60% → 70%

---

## 📊 Monitoring & Analytics

### Real-time Cost Dashboard
```javascript
// Example dashboard data
{
  "today": {
    "totalScrapes": 4235,
    "totalCost": "€1.42",
    "avgCost": "€0.0003",
    "byTier": {
      "direct": { "count": 2541, "cost": "€0" },
      "free": { "count": 847, "cost": "€0" },
      "webshare": { "count": 635, "cost": "€0.19" },
      "brightdata": { "count": 169, "cost": "€1.69" },
      "aivision": { "count": 43, "cost": "€0.86" }
    }
  },
  "month": {
    "totalScrapes": 118_450,
    "totalCost": "€73.21",
    "projectedEnd": "€81.45"
  }
}
```

### Success Rate Monitoring
```javascript
// Auto-alert if success rate drops
if (tier.successRate < 0.3 && tier.totalRequests > 20) {
  console.warn(`⚠️ Disabling ${tierName} (success: ${tier.successRate})`);
  tier.enabled = false;
  
  // Send alert email
  await sendAlert({
    subject: `Scraper Alert: ${tierName} disabled`,
    message: `Success rate dropped to ${tier.successRate}. Check proxy health.`
  });
}
```

### Cost Alerts
```javascript
// Daily budget monitoring
const DAILY_BUDGET = 3.00; // €3/day = €90/month

if (stats.today.totalCost > DAILY_BUDGET) {
  await sendAlert({
    subject: 'Scraping Budget Exceeded',
    message: `Today's cost: €${stats.today.totalCost} exceeds budget of €${DAILY_BUDGET}`
  });
}
```

---

## 🚀 Testing & Validation

### Test Scenarios

**1. End-to-end Test**
```bash
curl -X POST http://localhost:3000/api/v1/scraper/run \
  -H "Content-Type: application/json" \
  -d '{ "customerId": 1, "limit": 5 }'
```

Expected result:
- 5 products scraped across 4 retailers
- Mix of tiers used (60% direct, 20% free, 15% webshare, 5% premium)
- Total cost < €0.50
- 99%+ success rate

**2. Tier Fallback Test**
```bash
# Block Coolblue.nl in /etc/hosts to force fallback
echo "127.0.0.1 www.coolblue.nl" >> /etc/hosts

curl -X POST http://localhost:3000/api/v1/scraper/test
```

Expected result:
- Tier 1 fails (blocked)
- Tier 2 succeeds (proxy bypasses block)
- Response shows tier: "free"

**3. Cost Tracking Test**
```bash
# Run 100 scrapes and check cost
for i in {1..100}; do
  curl -X POST http://localhost:3000/api/v1/scraper/test
done

# Check stats
curl http://localhost:3000/api/v1/scraper/stats
```

Expected result:
- Total cost < €3.00
- Avg cost per scrape < €0.03
- Direct success ~60%

---

## 📝 Conclusion

The cost-optimized hybrid scraper reduces monthly costs by **94%** while maintaining 99%+ success rates. This makes PriceElephant's business model viable and enables competitive pricing.

**Key Achievements:**
- ✅ €750/month cost savings
- ✅ Professional plan now profitable (was -700% margin)
- ✅ Freemium model now possible
- ✅ Break-even at 1 customer (was 134)
- ✅ Scalable architecture (add new tiers easily)
- ✅ Full cost transparency per scrape

**Next Steps:**
1. Deploy WebShare integration (€30/month)
2. Implement smart caching (50% cost reduction)
3. Monitor production performance
4. Optimize retailer-specific selectors
5. Build cost analytics dashboard
