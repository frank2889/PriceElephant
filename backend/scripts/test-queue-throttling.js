/**
 * Test Queue with Adaptive Throttling
 * 
 * Demonstrates how adaptive throttling works in the Bull queue:
 * - 5 concurrent workers
 * - Shared throttler across workers
 * - Per-retailer delay adaptation
 * - Real-time stats
 */

require('dotenv').config();
const { queueAllProducts, getQueueStats, getThrottlingStats, clearQueue } = require('../jobs/scraper-queue');
const db = require('../config/database');

async function testQueueThrottling() {
  console.log('🧪 Testing Adaptive Throttling in Queue\n');
  
  // Clear queue first
  console.log('🧹 Clearing existing jobs...');
  await clearQueue();
  
  // Create test products with competitor URLs
  console.log('\n📝 Setting up test data...');
  
  const testCustomerId = 8557353828568; // Hobo customer
  
  // Insert test products if not exist
  const testProducts = [
    { ean: 'TEST001', name: 'Test Product 1 (Coolblue)', retailer: 'coolblue', url: 'https://www.coolblue.nl/product/123456' },
    { ean: 'TEST002', name: 'Test Product 2 (Bol.com)', retailer: 'bol', url: 'https://www.bol.com/nl/nl/p/test/123456789' },
    { ean: 'TEST003', name: 'Test Product 3 (Coolblue)', retailer: 'coolblue', url: 'https://www.coolblue.nl/product/654321' },
    { ean: 'TEST004', name: 'Test Product 4 (Amazon)', retailer: 'amazon', url: 'https://www.amazon.nl/dp/B08TEST123' },
    { ean: 'TEST005', name: 'Test Product 5 (Bol.com)', retailer: 'bol', url: 'https://www.bol.com/nl/nl/p/test2/987654321' }
  ];
  
  for (const testProduct of testProducts) {
    // Insert product
    const [product] = await db('products')
      .insert({
        shopify_customer_id: testCustomerId,
        product_name: testProduct.name,
        product_ean: testProduct.ean,
        current_price: 99.99,
        created_at: new Date(),
        updated_at: new Date()
      })
      .onConflict(['product_ean', 'shopify_customer_id'])
      .merge()
      .returning('id');
    
    // Insert competitor URL
    await db('manual_competitor_urls')
      .insert({
        product_id: product?.id || (await db('products').where({ product_ean: testProduct.ean, shopify_customer_id: testCustomerId }).first()).id,
        retailer: testProduct.retailer,
        competitor_url: testProduct.url,
        added_at: new Date()
      })
      .onConflict(['product_id', 'retailer'])
      .merge();
  }
  
  console.log(`✅ Created ${testProducts.length} test products\n`);
  
  // Queue products
  console.log('📥 Queueing scraping jobs...');
  const queueResult = await queueAllProducts(testCustomerId);
  
  console.log(`✅ Queued ${queueResult.queued} jobs (${queueResult.deduped} deduped)\n`);
  
  // Monitor queue progress
  console.log('📊 Monitoring queue progress (Ctrl+C to stop)...\n');
  console.log('=' .repeat(100));
  
  let lastStats = null;
  const statsInterval = setInterval(async () => {
    try {
      const stats = await getQueueStats();
      const throttlingStats = getThrottlingStats();
      
      // Only log if something changed
      const statsChanged = JSON.stringify(stats.queue) !== JSON.stringify(lastStats);
      if (statsChanged || stats.queue.active > 0) {
        console.log(`\n⏰ ${new Date().toISOString()}`);
        console.log(`Queue: ${stats.queue.waiting} waiting | ${stats.queue.active} active | ${stats.queue.completed} completed | ${stats.queue.failed} failed`);
        
        if (throttlingStats.length > 0) {
          console.log('\n📈 Throttling Stats:');
          throttlingStats.forEach(stat => {
            console.log(`   ${stat.retailer}:`);
            console.log(`      Delay: ${stat.currentDelay}ms | Error rate: ${stat.errorRate} | Success rate: ${stat.successRate}`);
            console.log(`      Requests: ${stat.totalRequests} | Avg response: ${stat.avgResponseTime}`);
          });
        }
        
        lastStats = stats.queue;
      }
      
      // Stop when queue is empty
      if (stats.queue.waiting === 0 && stats.queue.active === 0) {
        console.log('\n' + '='.repeat(100));
        console.log('\n✅ All jobs completed!\n');
        
        console.log('📊 FINAL THROTTLING STATS:');
        console.log('='.repeat(100));
        
        throttlingStats.forEach(stat => {
          console.log(`\n${stat.retailer}:`);
          console.log(`  Final delay: ${stat.currentDelay}ms (started at 2000ms)`);
          console.log(`  Error rate: ${stat.errorRate}`);
          console.log(`  Success rate: ${stat.successRate}`);
          console.log(`  Total requests: ${stat.totalRequests}`);
          console.log(`  Total errors: ${stat.totalErrors}`);
          console.log(`  Avg response time: ${stat.avgResponseTime}`);
        });
        
        console.log('\n💡 Key Observations:');
        console.log('   - Delays should adapt based on error rates');
        console.log('   - Strict retailers (Coolblue) → higher delays');
        console.log('   - Lenient retailers (Bol.com) → lower delays');
        console.log('   - Rate limits (429) → exponential backoff');
        console.log('   - This is SHARED across 5 workers for consistency!\n');
        
        clearInterval(statsInterval);
        
        // Clean up test data
        console.log('🧹 Cleaning up test data...');
        await db('manual_competitor_urls')
          .whereIn('product_id', 
            db('products')
              .select('id')
              .where('shopify_customer_id', testCustomerId)
              .whereIn('product_ean', testProducts.map(p => p.ean))
          )
          .delete();
        
        await db('products')
          .where('shopify_customer_id', testCustomerId)
          .whereIn('product_ean', testProducts.map(p => p.ean))
          .delete();
        
        console.log('✅ Test data cleaned up\n');
        
        process.exit(0);
      }
    } catch (error) {
      console.error('Error monitoring queue:', error);
      clearInterval(statsInterval);
      process.exit(1);
    }
  }, 3000); // Check every 3 seconds
  
  // Handle Ctrl+C
  process.on('SIGINT', async () => {
    console.log('\n\n⚠️  Interrupted by user');
    clearInterval(statsInterval);
    
    console.log('\n📊 Current throttling state:');
    const finalStats = getThrottlingStats();
    finalStats.forEach(stat => {
      console.log(`\n${stat.retailer}: ${stat.currentDelay}ms delay (${stat.errorRate} errors)`);
    });
    
    process.exit(0);
  });
}

// Run test
if (require.main === module) {
  testQueueThrottling()
    .catch(err => {
      console.error('❌ Test failed:', err);
      process.exit(1);
    });
}

module.exports = testQueueThrottling;
