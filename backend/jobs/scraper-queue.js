/**
 * Scraper Queue - Bull-based job processor
 * Handles asynchronous scraping jobs with Redis
 * 
 * Features:
 * - 5 concurrent workers
 * - Retry logic (3 attempts)
 * - Job status tracking
 * - Multi-tenant deduplication
 */

const Bull = require('bull');
const redis = require('../config/redis');
const HybridScraper = require('../crawlers/hybrid-scraper');
const db = require('../config/database');

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
 */
scraperQueue.process(5, async (job) => {
  const { productId, retailer, url, ean, customerId } = job.data;
  
  console.log(`[Job ${job.id}] Processing scrape: ${retailer} - ${ean || productId}`);
  
  const scraper = new HybridScraper();
  
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
    console.error(`[Job ${job.id}] Failed:`, error.message);
    
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
 */
async function getQueueStats() {
  const [waiting, active, completed, failed] = await Promise.all([
    scraperQueue.getWaitingCount(),
    scraperQueue.getActiveCount(),
    scraperQueue.getCompletedCount(),
    scraperQueue.getFailedCount()
  ]);
  
  return {
    waiting,
    active,
    completed,
    failed,
    total: waiting + active + completed + failed
  };
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
  clearQueue
};
