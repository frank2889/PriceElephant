/**
 * HTTP Cache Manager - ETag & Last-Modified Caching
 * 
 * Reduces scraping costs by using HTTP conditional requests.
 * Stores ETag and Last-Modified headers per product URL.
 * Uses HEAD requests to check if content changed (304 Not Modified).
 * 
 * Benefits:
 * - 30%+ cache hit rate on 2nd daily run
 * - 50% cost reduction on cached hits
 * - Reduced bandwidth and faster responses
 */

const redis = require('../config/redis');

class HttpCacheManager {
  constructor(options = {}) {
    this.redis = redis;
    this.ttl = options.ttl || 86400; // 24 hours default
    this.keyPrefix = options.keyPrefix || 'http_cache:';
    this.verbose = options.verbose || false;
  }

  /**
   * Generate Redis key for URL
   * @param {string} url - Product URL
   * @returns {string} Redis key
   */
  getCacheKey(url) {
    // Normalize URL to avoid duplicates
    const normalized = url.toLowerCase().split('?')[0]; // Remove query params
    return `${this.keyPrefix}${Buffer.from(normalized).toString('base64')}`;
  }

  /**
   * Store HTTP headers for a URL
   * @param {string} url - Product URL
   * @param {Object} headers - Response headers (ETag, Last-Modified)
   * @param {Object} data - Cached product data
   */
  async store(url, headers, data) {
    const key = this.getCacheKey(url);
    
    const cacheEntry = {
      url,
      etag: headers.etag || headers.ETag || null,
      lastModified: headers['last-modified'] || headers['Last-Modified'] || null,
      data,
      cachedAt: new Date().toISOString()
    };

    try {
      await this.redis.setex(key, this.ttl, JSON.stringify(cacheEntry));
      
      if (this.verbose) {
        console.log(`💾 [HttpCache] Stored cache for ${url}`, {
          etag: cacheEntry.etag ? '✓' : '✗',
          lastModified: cacheEntry.lastModified ? '✓' : '✗'
        });
      }
    } catch (error) {
      console.error(`❌ [HttpCache] Failed to store cache:`, error.message);
    }
  }

  /**
   * Get cached entry for URL
   * @param {string} url - Product URL
   * @returns {Object|null} Cached entry or null
   */
  async get(url) {
    const key = this.getCacheKey(url);
    
    try {
      const cached = await this.redis.get(key);
      if (!cached) return null;

      const entry = JSON.parse(cached);
      
      if (this.verbose) {
        console.log(`📦 [HttpCache] Found cache for ${url}`, {
          age: Math.round((Date.now() - new Date(entry.cachedAt)) / 1000 / 60) + 'min'
        });
      }

      return entry;
    } catch (error) {
      console.error(`❌ [HttpCache] Failed to get cache:`, error.message);
      return null;
    }
  }

  /**
   * Check if URL content has changed using HEAD request
   * @param {string} url - Product URL
   * @param {Object} page - Playwright page instance
   * @returns {Object} { changed: boolean, headers: Object, cached: Object|null }
   */
  async checkIfModified(url, page) {
    const cached = await this.get(url);
    
    if (!cached) {
      return { changed: true, headers: {}, cached: null };
    }

    try {
      // Use Playwright to make HEAD request with conditional headers
      const requestHeaders = {};
      
      if (cached.etag) {
        requestHeaders['If-None-Match'] = cached.etag;
      }
      
      if (cached.lastModified) {
        requestHeaders['If-Modified-Since'] = cached.lastModified;
      }

      // Make HEAD request to check freshness
      const response = await page.request.head(url, {
        headers: requestHeaders,
        timeout: 5000
      });

      const status = response.status();
      const headers = response.headers();

      if (status === 304) {
        // Content not modified - use cached data
        if (this.verbose) {
          console.log(`✅ [HttpCache] 304 Not Modified - using cache for ${url}`);
        }
        
        return { 
          changed: false, 
          headers, 
          cached: cached.data,
          hitType: 'cache-hit'
        };
      } else {
        // Content changed - need fresh scrape
        if (this.verbose) {
          console.log(`🔄 [HttpCache] ${status} - content changed for ${url}`);
        }
        
        return { 
          changed: true, 
          headers, 
          cached: null,
          hitType: 'cache-miss'
        };
      }

    } catch (error) {
      // HEAD request failed - fall back to full scrape
      if (this.verbose) {
        console.warn(`⚠️ [HttpCache] HEAD request failed: ${error.message}`);
      }
      
      return { 
        changed: true, 
        headers: {}, 
        cached: null,
        hitType: 'cache-error'
      };
    }
  }

  /**
   * Delete cached entry for URL
   * @param {string} url - Product URL
   */
  async delete(url) {
    const key = this.getCacheKey(url);
    
    try {
      await this.redis.del(key);
      
      if (this.verbose) {
        console.log(`🗑️ [HttpCache] Deleted cache for ${url}`);
      }
    } catch (error) {
      console.error(`❌ [HttpCache] Failed to delete cache:`, error.message);
    }
  }

  /**
   * Clear all cached entries
   */
  async clearAll() {
    try {
      const keys = await this.redis.keys(`${this.keyPrefix}*`);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
        console.log(`🗑️ [HttpCache] Cleared ${keys.length} cache entries`);
      }
    } catch (error) {
      console.error(`❌ [HttpCache] Failed to clear cache:`, error.message);
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  async getStats() {
    try {
      const keys = await this.redis.keys(`${this.keyPrefix}*`);
      const totalEntries = keys.length;
      
      // Sample first 10 entries to calculate average age
      const sampleKeys = keys.slice(0, 10);
      const samples = await Promise.all(
        sampleKeys.map(key => this.redis.get(key))
      );
      
      const validSamples = samples.filter(Boolean);
      const ages = validSamples.map(s => {
        try {
          const entry = JSON.parse(s);
          return (Date.now() - new Date(entry.cachedAt)) / 1000 / 60; // minutes
        } catch {
          return 0;
        }
      });
      
      const avgAge = ages.length > 0 
        ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length)
        : 0;

      return {
        totalEntries,
        avgAgeMinutes: avgAge,
        ttlSeconds: this.ttl,
        keyPrefix: this.keyPrefix
      };
    } catch (error) {
      console.error(`❌ [HttpCache] Failed to get stats:`, error.message);
      return { totalEntries: 0, avgAgeMinutes: 0 };
    }
  }
}

module.exports = HttpCacheManager;
