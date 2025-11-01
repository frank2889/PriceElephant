/**
 * Sitemap Import Queue - Background job processor
 * Handles long-running sitemap imports that can continue even if browser is closed
 */

const Bull = require('bull');
const redis = require('../config/redis');
const SitemapImportService = require('../services/sitemap-import');
const db = require('../config/database');

// Create queue
const sitemapImportQueue = new Bull('sitemap-import', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined
  },
  defaultJobOptions: {
    attempts: 1, // Don't retry - imports can be resumed manually
    removeOnComplete: 10, // Keep last 10 completed jobs
    removeOnFail: 10 // Keep last 10 failed jobs
  }
});

/**
 * Job Processor - Runs a sitemap import in the background
 */
sitemapImportQueue.process(async (job) => {
  const { customerId, sitemapUrl, maxProducts, productUrlPattern, resetProgress } = job.data;
  
  console.log(`[Sitemap Queue] Starting import for customer ${customerId}`);
  console.log(`[Sitemap Queue] Sitemap URL: ${sitemapUrl}`);
  console.log(`[Sitemap Queue] Max products: ${maxProducts}`);
  console.log(`[Sitemap Queue] Reset progress: ${resetProgress}`);

  const service = new SitemapImportService(customerId);

  // Progress callback - update job progress
  const onProgress = async (progressData) => {
    try {
      await job.progress(progressData);
      
      // Also save to database for status endpoint
      await db('sitemap_import_status')
        .insert({
          customer_id: customerId,
          status: 'running',
          progress: progressData.percentage || 0,
          scanned: progressData.scanned || 0,
          detected: progressData.detectedProducts || 0,
          created: progressData.created || 0,
          updated: progressData.updated || 0,
          skipped: progressData.skipped || 0,
          errors: progressData.errors || 0,
          current_url: progressData.currentUrl || null,
          message: progressData.message || null,
          updated_at: db.fn.now()
        })
        .onConflict('customer_id')
        .merge();
    } catch (err) {
      console.error('[Sitemap Queue] Progress update error:', err.message);
    }
  };

  try {
    const results = await service.importFromSitemap(sitemapUrl, {
      maxProducts: parseInt(maxProducts) || 500,
      productUrlPattern: productUrlPattern || null,
      resetProgress: resetProgress === true || resetProgress === 'true',
      onProgress,
      isCancelled: () => false // Background jobs don't get cancelled by browser
    });

    console.log(`[Sitemap Queue] ✅ Import completed for customer ${customerId}:`, {
      scanned: results.scanned,
      created: results.created,
      updated: results.updated,
      skipped: results.skipped,
      errors: results.errors.length
    });

    // Update final status
    await db('sitemap_import_status')
      .insert({
        customer_id: customerId,
        status: 'completed',
        progress: 100,
        scanned: results.scanned,
        detected: results.detectedProducts,
        created: results.created,
        updated: results.updated,
        skipped: results.skipped,
        errors: results.errors.length,
        completed_at: db.fn.now(),
        updated_at: db.fn.now()
      })
      .onConflict('customer_id')
      .merge();

    return results;
  } catch (error) {
    console.error(`[Sitemap Queue] ❌ Import failed for customer ${customerId}:`, error.message);

    // Update error status
    await db('sitemap_import_status')
      .insert({
        customer_id: customerId,
        status: 'failed',
        error_message: error.message,
        updated_at: db.fn.now()
      })
      .onConflict('customer_id')
      .merge();

    throw error;
  }
});

// Event handlers
sitemapImportQueue.on('completed', (job, result) => {
  console.log(`[Sitemap Queue] Job ${job.id} completed:`, {
    customerId: job.data.customerId,
    scanned: result.scanned,
    created: result.created
  });
});

sitemapImportQueue.on('failed', (job, err) => {
  console.error(`[Sitemap Queue] Job ${job.id} failed:`, {
    customerId: job.data.customerId,
    error: err.message
  });
});

sitemapImportQueue.on('active', (job) => {
  console.log(`[Sitemap Queue] Job ${job.id} started for customer ${job.data.customerId}`);
});

module.exports = sitemapImportQueue;
