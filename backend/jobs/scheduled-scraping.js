/**
 * Scheduled Scraping Jobs
 * 
 * Cron jobs for automatic price scraping:
 * - 2x per day (9:00 AM and 9:00 PM)
 * - Queue all products with competitor URLs
 * - Process with Bull queue (5 concurrent workers)
 * - Detect price changes and trigger alerts
 */

const cron = require('node-cron');
const { queueAllProducts, getQueueStats } = require('./scraper-queue');
const PriceChangeDetector = require('../services/price-change-detector');
const db = require('../config/database');

const detector = new PriceChangeDetector();

/**
 * Run scraping job
 */
async function runScrapingJob() {
  console.log('\n' + '='.repeat(80));
  console.log(`🤖 Scheduled Scraping Job Started - ${new Date().toISOString()}`);
  console.log('='.repeat(80));
  
  try {
    // Queue all products
    const result = await queueAllProducts();
    
    console.log(`✅ Queued scraping jobs:`);
    console.log(`   Total products: ${result.total}`);
    console.log(`   Unique scrapes: ${result.queued}`);
    console.log(`   Deduped (saved): ${result.deduped}`);
    
    // Wait for queue to complete (with timeout)
    console.log('\n⏳ Waiting for queue to complete...');
    await waitForQueueCompletion(300000); // 5 minute timeout
    
    // Get stats
    const stats = await getQueueStats();
    console.log(`\n📊 Queue Stats:`);
    console.log(`   Completed: ${stats.completed}`);
    console.log(`   Failed: ${stats.failed}`);
    console.log(`   Success rate: ${((stats.completed / (stats.completed + stats.failed)) * 100).toFixed(1)}%`);
    
    // Run price change detection
    console.log('\n🔍 Detecting price changes...');
    const changes = await detectAllPriceChanges();
    
    console.log(`\n✅ Scraping job complete:`);
    console.log(`   ${stats.completed} products scraped`);
    console.log(`   ${changes.length} price changes detected`);
    
  } catch (error) {
    console.error('❌ Scraping job failed:', error);
  }
  
  console.log('='.repeat(80) + '\n');
}

/**
 * Wait for queue to complete processing
 */
async function waitForQueueCompletion(timeout = 300000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const stats = await getQueueStats();
    
    if (stats.waiting === 0 && stats.active === 0) {
      console.log('✅ Queue completed');
      return;
    }
    
    console.log(`   Waiting: ${stats.waiting}, Active: ${stats.active}`);
    await new Promise(resolve => setTimeout(resolve, 5000)); // Check every 5 seconds
  }
  
  console.warn('⚠️  Queue did not complete within timeout');
}

/**
 * Detect price changes for all products
 */
async function detectAllPriceChanges() {
  const products = await db('products')
    .select('id');
  
  const allChanges = [];
  
  for (const product of products) {
    try {
      const changes = await detector.detectChanges(product.id);
      allChanges.push(...changes);
    } catch (error) {
      console.error(`Error detecting changes for product ${product.id}:`, error.message);
    }
  }
  
  return allChanges;
}

/**
 * Setup cron jobs
 */
function setupCronJobs() {
  console.log('🕐 Setting up cron jobs...');
  
  // Run at 9:00 AM every day
  cron.schedule('0 9 * * *', () => {
    console.log('⏰ Morning scraping job triggered');
    runScrapingJob();
  }, {
    timezone: 'Europe/Amsterdam'
  });
  
  // Run at 9:00 PM every day
  cron.schedule('0 21 * * *', () => {
    console.log('⏰ Evening scraping job triggered');
    runScrapingJob();
  }, {
    timezone: 'Europe/Amsterdam'
  });
  
  console.log('✅ Cron jobs scheduled:');
  console.log('   - 9:00 AM daily (Europe/Amsterdam)');
  console.log('   - 9:00 PM daily (Europe/Amsterdam)');
}

/**
 * Run job manually (for testing)
 */
async function runManual() {
  console.log('🧪 Running manual scraping job...\n');
  await runScrapingJob();
  process.exit(0);
}

// Handle price change events
detector.on('priceChange', async (change) => {
  console.log(`💰 Price Change Detected:`);
  console.log(`   Product: ${change.productId}`);
  console.log(`   Retailer: ${change.retailer}`);
  console.log(`   ${change.changeType.toUpperCase()}: €${change.previousPrice} → €${change.currentPrice} (${change.percentageChange.toFixed(1)}%)`);
  
  // TODO: Trigger email alert (Klaviyo integration - Sprint 4)
  // For now, just log to price_alerts table
  try {
    await db('price_alerts').insert({
      product_id: change.productId,
      retailer: change.retailer,
      price_old: change.previousPrice,
      price_new: change.currentPrice,
      change_percentage: change.percentageChange,
      detected_at: new Date(),
      notified: false // Will be set to true after email sent
    });
  } catch (error) {
    console.error('Error storing price alert:', error);
  }
});

module.exports = {
  setupCronJobs,
  runScrapingJob,
  runManual
};

// Run manual if called directly
if (require.main === module) {
  runManual();
}
