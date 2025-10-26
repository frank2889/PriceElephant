/**
 * Test Enhanced Hybrid Scraper
 * 
 * This tests the upgraded scraper with:
 * - Intelligent scheduling (priority-based scraping)
 * - Real-time price alerts
 * - Multi-tier fallback
 */

require('dotenv').config();
const HybridScraper = require('../crawlers/hybrid-scraper');
const db = require('../config/database');

async function testEnhancedScraper() {
  console.log('🧪 Testing Enhanced Hybrid Scraper\n');
  console.log('Features being tested:');
  console.log('✅ Multi-tier fallback (Direct → Free → WebShare → Bright Data → AI)');
  console.log('✅ Intelligent scheduling (hot/warm/normal/cold products)');
  console.log('✅ Real-time price alerts (drops, undercuts, stock changes)');
  console.log('✅ Cost optimization\n');

  try {
    // Create test customer
    const customerId = 'test-customer-enhanced';
    
    // Test with Railway products (assuming they exist)
    const testProducts = [
      {
        name: 'iPhone 15 Pro',
        ean: '0194253782452',
        url: 'https://www.coolblue.nl/product/938461/apple-iphone-15-pro-128gb-naturel-titanium.html',
        retailer: 'coolblue'
      },
      {
        name: 'Samsung Galaxy S24',
        ean: '8806095093147',
        url: 'https://www.bol.com/nl/nl/p/samsung-galaxy-s24-5g-128gb-violet/9300000159829821/',
        retailer: 'bol'
      }
    ];

    const scraper = new HybridScraper();

    console.log('\n📋 Test Plan:');
    console.log(`   - Products to test: ${testProducts.length}`);
    console.log(`   - Customer ID: ${customerId}`);
    console.log(`   - Features: Scheduling, Alerts, Multi-tier fallback\n`);

    const results = [];

    for (const testProduct of testProducts) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🎯 Testing: ${testProduct.name}`);
      console.log(`   EAN: ${testProduct.ean}`);
      console.log(`   URL: ${testProduct.url}`);
      console.log(`   Retailer: ${testProduct.retailer}`);
      console.log(`${'='.repeat(60)}\n`);

      // First, create a product in database (if not exists)
      let productId;
      const existing = await db('products')
        .where({ ean: testProduct.ean })
        .first();

      if (existing) {
        productId = existing.id;
        console.log(`✅ Found existing product ID: ${productId}`);
      } else {
        // Check if we have a client_id (required)
        let clientId;
        const client = await db('clients')
          .where({ shopify_domain: 'test-enhanced.myshopify.com' })
          .first();
        
        if (client) {
          clientId = client.id;
        } else {
          // Create test client
          const [newClient] = await db('clients').insert({
            name: 'Test Enhanced Customer',
            shopify_domain: 'test-enhanced.myshopify.com',
            api_key: 'test-api-key-enhanced',
            active: true
          }).returning('id');
          clientId = newClient.id;
          console.log(`✅ Created test client ID: ${clientId}`);
        }

        const [newProduct] = await db('products').insert({
          client_id: clientId,
          title: testProduct.name,
          ean: testProduct.ean,
          product_url: testProduct.url,
          current_price: 0,
          active: true
        }).returning('id');
        productId = newProduct.id;
        console.log(`✅ Created new product ID: ${productId}`);
      }

      // Test 1: First scrape (should execute - no history)
      console.log('\n📊 Test 1: First scrape (should execute)\n');
      try {
        const result1 = await scraper.scrapeProduct(
          testProduct.url,
          testProduct.ean,
          testProduct.retailer,
          productId,
          customerId
        );

        if (result1.skipped) {
          console.log('⏭️  SKIPPED:', result1.reason);
        } else {
          console.log('✅ SCRAPED:');
          console.log(`   - Price: €${result1.price}`);
          console.log(`   - In Stock: ${result1.inStock}`);
          console.log(`   - Method: ${result1.tier}`);
          console.log(`   - Cost: €${result1.cost}`);
        }

        results.push({
          product: testProduct.name,
          test: 'First scrape',
          ...result1
        });
      } catch (error) {
        console.error('❌ Error in first scrape:', error.message);
      }

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Test 2: Immediate re-scrape (should skip - just scraped)
      console.log('\n📊 Test 2: Immediate re-scrape (should skip)\n');
      try {
        const result2 = await scraper.scrapeProduct(
          testProduct.url,
          testProduct.ean,
          testProduct.retailer,
          productId,
          customerId
        );

        if (result2.skipped) {
          console.log('⏭️  SKIPPED (as expected):', result2.reason);
        } else {
          console.log('⚠️  SCRAPED (unexpected - scheduler should have skipped)');
        }

        results.push({
          product: testProduct.name,
          test: 'Immediate re-scrape',
          ...result2
        });
      } catch (error) {
        console.error('❌ Error in re-scrape:', error.message);
      }

      // Test 3: Simulate price change to trigger alert
      console.log('\n📊 Test 3: Simulating price change for alerts\n');
      try {
        // Get latest price
        const latestSnapshot = await db('price_snapshots')
          .where({ product_id: productId })
          .orderBy('scraped_at', 'desc')
          .first();

        if (latestSnapshot) {
          console.log(`📈 Latest price: €${latestSnapshot.price}`);
          
          // Manually insert a lower price to simulate drop (for alert testing)
          const newPrice = latestSnapshot.price * 0.90; // 10% drop
          await db('price_snapshots').insert({
            product_id: productId,
            retailer: testProduct.retailer,
            price: newPrice,
            currency: 'EUR',
            in_stock: true,
            scraped_at: new Date(),
            scraping_method: 'test',
            scraping_cost: 0,
            metadata: JSON.stringify({ test: true })
          });

          console.log(`💰 Inserted test price drop: €${latestSnapshot.price} → €${newPrice} (-10%)`);
          console.log('🔔 This should trigger a PRICE_DROP alert');

          // Check if alert was created
          const alerts = await db('price_alerts')
            .where({ product_id: productId })
            .orderBy('created_at', 'desc')
            .limit(5);

          if (alerts.length > 0) {
            console.log(`\n✅ Generated ${alerts.length} alerts:`);
            alerts.forEach(alert => {
              console.log(`   - ${alert.alert_type}: ${alert.message} (severity: ${alert.severity})`);
            });
          } else {
            console.log('\n⚠️  No alerts generated (check price-alert.js configuration)');
          }
        }
      } catch (error) {
        console.error('❌ Error simulating price change:', error.message);
      }
    }

    // Print final statistics
    console.log(`\n\n${'='.repeat(60)}`);
    console.log('📊 FINAL RESULTS');
    console.log(`${'='.repeat(60)}\n`);

    const stats = scraper.getStats();
    console.log('Scraper Stats:');
    console.log(`   - Total attempts: ${stats.total}`);
    console.log(`   - Direct success: ${stats.directSuccess} (${((stats.directSuccess/stats.total)*100).toFixed(1)}%)`);
    console.log(`   - Free proxy: ${stats.freeProxySuccess}`);
    console.log(`   - WebShare: ${stats.paidProxySuccess}`);
    console.log(`   - Bright Data: ${stats.premiumProxySuccess}`);
    console.log(`   - AI Vision: ${stats.aiVisionSuccess}`);
    console.log(`   - Failures: ${stats.failures}`);
    console.log(`   - Total cost: €${stats.totalCost.toFixed(4)}`);
    console.log(`   - Average cost: €${(stats.totalCost / stats.total).toFixed(4)}/scrape`);

    console.log('\nTest Summary:');
    results.forEach((r, i) => {
      console.log(`\n${i + 1}. ${r.product} - ${r.test}`);
      if (r.skipped) {
        console.log(`   ⏭️  Skipped: ${r.reason}`);
      } else {
        console.log(`   ✅ Price: €${r.price || 'N/A'}`);
        console.log(`   💰 Cost: €${r.cost || 0}`);
        console.log(`   🔧 Method: ${r.tier || 'N/A'}`);
      }
    });

    console.log('\n✅ Enhanced scraper test complete!\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error(error.stack);
  } finally {
    await db.destroy();
    process.exit(0);
  }
}

// Run test
testEnhancedScraper();
