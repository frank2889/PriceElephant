/**
 * Scraper Queue - Bull-based job processor
 * Handles asynchronous scraping jobs with Redis
 * 
 * Features:
 * - 5 concurrent workers
 * - Retry logic (3 attempts)
 * - Job status tracking
 * - Multi-tenant deduplication
 * - Adaptive throttling per retailer
 */

const Bull = require('bull');
const redis = require('../config/redis');
const HybridScraper = require('../crawlers/hybrid-scraper');
const AdaptiveThrottler = require('../utils/adaptive-throttling');
const db = require('../config/database');

// Shared throttler instance across all workers
// This ensures consistent throttling even with 5 concurrent workers
const sharedThrottler = new AdaptiveThrottler({ 
  verbose: true,
  minDelay: 500,
  maxDelay: 30000,
  defaultDelay: 2000
});

// Create queue
const scraperQueue = new Bull('price-scraping', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 500 // Keep last 500 failed jobs for debugging
  }
});

/**
 * Job Processor - Scrapes a single product from a single retailer
 * Now with adaptive throttling
 */
scraperQueue.process(5, async (job) => {
  const { productId, retailer, url, ean, customerId } = job.data;
  
  console.log(`[Job ${job.id}] Processing scrape: ${retailer} - ${ean || productId}`);
  
  // Apply adaptive throttling BEFORE creating scraper
  // This ensures delays are respected across all workers
  await sharedThrottler.beforeRequest(retailer);
  
  const scraper = new HybridScraper();
  // Use shared throttler instead of scraper's own instance
  scraper.throttler = sharedThrottler;
  
  const scrapeStartTime = Date.now();
  let scrapeError = null;
  
  try {
    // Check if this EAN was recently scraped (multi-tenant optimization)
    if (ean) {
      const recentScrape = await db('price_snapshots')
        .where({ ean, retailer })
        .where('scraped_at', '>', db.raw("NOW() - INTERVAL '1 hour'"))
        .orderBy('scraped_at', 'desc')
        .first();
      
      if (recentScrape) {
        console.log(`[Job ${job.id}] Using cached scrape from ${recentScrape.scraped_at}`);
        
        // Create snapshot for this customer
        await db('price_snapshots').insert({
          product_id: productId,
          ean,
          retailer,
          price: recentScrape.price,
          in_stock: recentScrape.in_stock,
          scraped_at: new Date(),
          scrape_method: 'cached',
          cost: 0
        });
        
        // Update throttler (cached = fast success)
        const responseTime = Date.now() - scrapeStartTime;
        await sharedThrottler.afterRequest(retailer, {
          success: true,
          responseTime,
          status: 200
        });
        
        return {
          productId,
          retailer,
          price: recentScrape.price,
          inStock: recentScrape.in_stock,
          method: 'cached',
          cost: 0
        };
      }
    }
    
    // Scrape fresh data
    const result = await scraper.scrapeProduct(url, ean, retailer, productId);
    
    console.log(`[Job ${job.id}] Success: €${result.price} via ${result.tier} (cost: €${result.cost})`);
    
    // Update job progress
    await job.progress(100);
    
    return result;
    
  } catch (error) {
    scrapeError = error;
    console.error(`[Job ${job.id}] Failed:`, error.message);
    
    // Update throttler with error
    const responseTime = Date.now() - scrapeStartTime;
    await sharedThrottler.afterRequest(retailer, {
      error: error.message,
      responseTime,
      status: error.message.includes('429') ? 429 : 500,
      success: false
    });
    
    // Log failure
    await db('scrape_jobs').insert({
      product_id: productId,
      retailer,
      status: 'failed',
      error_message: error.message,
      started_at: new Date(),
      completed_at: new Date()
    });
    
    throw error; // Will trigger retry
  }
});

/**
 * Queue all products for scraping
 * Multi-tenant optimization: deduplicate by EAN
 */
async function queueAllProducts(customerId = null) {
  console.log('📥 Queueing scraping jobs...');
  
  let query = db('products as p')
    .join('manual_competitor_urls as mc', 'p.id', 'mc.product_id')
    .select(
      'p.id as productId',
      'p.product_ean as ean',
      'p.shopify_customer_id as customerId',
      'mc.retailer',
      'mc.competitor_url as url'
    )
    .where('mc.competitor_url', '!=', '');
  
  if (customerId) {
    query = query.where('p.shopify_customer_id', customerId);
  }
  
  const products = await query;
  
  console.log(`Found ${products.length} products with competitor URLs`);
  
  // Deduplicate by EAN + retailer (multi-tenant optimization)
  const uniqueJobs = new Map();
  
  products.forEach(p => {
    const key = `${p.ean || p.productId}-${p.retailer}`;
    if (!uniqueJobs.has(key)) {
      uniqueJobs.set(key, p);
    }
  });
  
  console.log(`Deduped to ${uniqueJobs.size} unique scrape jobs`);
  
  // Queue jobs
  const jobs = [];
  for (const product of uniqueJobs.values()) {
    const job = await scraperQueue.add(
      'scrape-product',
      product,
      {
        priority: 1,
        jobId: `${product.ean || product.productId}-${product.retailer}-${Date.now()}`
      }
    );
    jobs.push(job);
  }
  
  console.log(`✅ Queued ${jobs.length} scraping jobs`);
  
  return {
    queued: jobs.length,
    total: products.length,
    deduped: products.length - jobs.length
  };
}

/**
 * Get queue statistics
 * Now includes adaptive throttling metrics
 */
async function getQueueStats() {
  const [waiting, active, completed, failed] = await Promise.all([
    scraperQueue.getWaitingCount(),
    scraperQueue.getActiveCount(),
    scraperQueue.getCompletedCount(),
    scraperQueue.getFailedCount()
  ]);
  
  return {
    queue: {
      waiting,
      active,
      completed,
      failed,
      total: waiting + active + completed + failed
    },
    throttling: sharedThrottler.getAllStats() // Per-retailer throttling stats
  };
}

/**
 * Get throttling stats only
 */
function getThrottlingStats() {
  return sharedThrottler.getAllStats();
}

/**
 * Reset throttling for a specific retailer
 */
function resetThrottling(retailer) {
  if (retailer) {
    sharedThrottler.reset(retailer);
    console.log(`✅ Throttling reset for ${retailer}`);
  } else {
    sharedThrottler.resetAll();
    console.log('✅ All throttling reset');
  }
}

/**
 * Clear all jobs (for testing)
 */
async function clearQueue() {
  await scraperQueue.empty();
  console.log('✅ Queue cleared');
}

// Event listeners
scraperQueue.on('completed', (job, result) => {
  console.log(`✅ Job ${job.id} completed: ${result.retailer} - €${result.price}`);
});

scraperQueue.on('failed', (job, error) => {
  console.error(`❌ Job ${job.id} failed:`, error.message);
});

scraperQueue.on('stalled', (job) => {
  console.warn(`⚠️  Job ${job.id} stalled`);
});

module.exports = {
  scraperQueue,
  queueAllProducts,
  getQueueStats,
  getThrottlingStats,
  resetThrottling,
  clearQueue,
  sharedThrottler // Export for testing
};
