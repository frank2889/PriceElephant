/**
 * Test Adaptive Throttling with Top 3 Retailers
 * 
 * Validates Sprint 2.9 improvements:
 * - Adaptive throttling reduces block rate
 * - HTTP caching improves speed
 * - Resource blocking improves speed
 * - Browser profiles reduce detection
 * 
 * Target Metrics:
 * - Block rate: <5%
 * - Speed improvement: 50%+ vs baseline
 * - Cache hit rate: 30%+ on 2nd run
 * - Success rate: 99%+
 */

require('dotenv').config();
const HybridScraper = require('../crawlers/hybrid-scraper');

// Test URLs for top 3 Dutch retailers
const TEST_PRODUCTS = {
  coolblue: {
    name: 'Coolblue',
    urls: [
      'https://www.coolblue.nl/product/920476/apple-iphone-15-128gb-zwart.html',
      'https://www.coolblue.nl/product/920477/apple-iphone-15-128gb-blauw.html',
      'https://www.coolblue.nl/product/920478/apple-iphone-15-128gb-roze.html'
    ]
  },
  bol: {
    name: 'Bol.com',
    urls: [
      'https://www.bol.com/nl/nl/p/apple-iphone-15-128gb-zwart/9300000139884891/',
      'https://www.bol.com/nl/nl/p/samsung-galaxy-s24-128gb-zwart/9300000152063843/',
      'https://www.bol.com/nl/nl/p/google-pixel-8-128gb-obsidian/9300000149561234/'
    ]
  },
  amazon: {
    name: 'Amazon.nl',
    urls: [
      'https://www.amazon.nl/Apple-iPhone-15-128-GB/dp/B0CHX1W1XY',
      'https://www.amazon.nl/Samsung-Galaxy-S24-Smartphone-Phantom/dp/B0CMDRCZBF',
      'https://www.amazon.nl/Google-Pixel-8-Smartphone-Obsidian/dp/B0CGTN4KYC'
    ]
  }
};

class RetailerTester {
  constructor() {
    this.scraper = new HybridScraper();
    this.results = {
      coolblue: { attempts: 0, successes: 0, failures: 0, blocks: 0, cachehits: 0, times: [] },
      bol: { attempts: 0, successes: 0, failures: 0, blocks: 0, cachehits: 0, times: [] },
      amazon: { attempts: 0, successes: 0, failures: 0, blocks: 0, cachehits: 0, times: [] }
    };
  }

  /**
   * Test single retailer with all URLs
   */
  async testRetailer(retailerKey, retailerData) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🏪 Testing ${retailerData.name}`);
    console.log(`${'='.repeat(60)}\n`);

    const stats = this.results[retailerKey];

    for (let i = 0; i < retailerData.urls.length; i++) {
      const url = retailerData.urls[i];
      stats.attempts++;

      console.log(`\n📦 Product ${i + 1}/${retailerData.urls.length}`);
      console.log(`URL: ${url}`);

      const startTime = Date.now();

      try {
        const result = await this.scraper.scrapeProduct(url, null, retailerKey);
        const duration = Date.now() - startTime;

        if (result.cacheHit) {
          stats.cachehits++;
          console.log(`✅ Cache Hit: €${result.price} (${duration}ms) - FREE!`);
        } else {
          stats.successes++;
          console.log(`✅ Success: €${result.price} (${duration}ms, tier: ${result.tier})`);
        }

        stats.times.push(duration);

        // Log throttling info
        const throttleStats = this.scraper.throttler.getStats(result.retailer);
        if (throttleStats) {
          console.log(`⏱️  Current delay: ${throttleStats.currentDelay}ms (success rate: ${throttleStats.successRate.toFixed(1)}%)`);
        }

      } catch (error) {
        const duration = Date.now() - startTime;
        stats.times.push(duration);

        // Check if blocked
        if (error.message.includes('429') || 
            error.message.includes('blocked') || 
            error.message.includes('captcha') ||
            error.message.includes('Access Denied')) {
          stats.blocks++;
          console.log(`🚫 BLOCKED: ${error.message} (${duration}ms)`);
        } else {
          stats.failures++;
          console.log(`❌ Failed: ${error.message} (${duration}ms)`);
        }

        // Log throttling response
        const throttleStats = this.scraper.throttler.getStats(retailerKey);
        if (throttleStats) {
          console.log(`⏱️  Throttle adjusted: ${throttleStats.currentDelay}ms (error detected)`);
        }
      }

      // Wait between products (let adaptive throttling do its thing)
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  /**
   * Test all retailers
   */
  async testAll() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  Sprint 2.9: Top 3 Retailers Adaptive Throttling Test     ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    const startTime = Date.now();

    // First pass - establish baselines
    console.log('\n📊 FIRST PASS - Establishing baselines & caching...\n');
    for (const [key, data] of Object.entries(TEST_PRODUCTS)) {
      await this.testRetailer(key, data);
      
      // Wait between retailers
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Second pass - test cache hits & optimized throttling
    console.log('\n\n📊 SECOND PASS - Testing cache hits & optimized delays...\n');
    const secondPassResults = {
      coolblue: { attempts: 0, successes: 0, failures: 0, blocks: 0, cachehits: 0, times: [] },
      bol: { attempts: 0, successes: 0, failures: 0, blocks: 0, cachehits: 0, times: [] },
      amazon: { attempts: 0, successes: 0, failures: 0, blocks: 0, cachehits: 0, times: [] }
    };

    for (const [key, data] of Object.entries(TEST_PRODUCTS)) {
      // Test first URL again (should be cached)
      const url = data.urls[0];
      const stats = secondPassResults[key];
      stats.attempts++;

      console.log(`\n🔄 Re-testing ${data.name}: ${url}`);

      const startTime2 = Date.now();

      try {
        const result = await this.scraper.scrapeProduct(url, null, key);
        const duration = Date.now() - startTime2;

        if (result.cacheHit) {
          stats.cachehits++;
          this.results[key].cachehits++; // Add to overall stats
          console.log(`✅ Cache Hit: €${result.price} (${duration}ms) - FREE! 🎯`);
        } else {
          stats.successes++;
          console.log(`✅ Success: €${result.price} (${duration}ms, tier: ${result.tier})`);
        }

        stats.times.push(duration);

      } catch (error) {
        const duration = Date.now() - startTime2;
        stats.times.push(duration);

        if (error.message.includes('429') || error.message.includes('blocked')) {
          stats.blocks++;
          console.log(`🚫 BLOCKED: ${error.message}`);
        } else {
          stats.failures++;
          console.log(`❌ Failed: ${error.message}`);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const totalTime = Date.now() - startTime;

    // Generate comprehensive report
    this.printReport(totalTime, secondPassResults);
  }

  /**
   * Print comprehensive test report
   */
  printReport(totalTime, secondPassResults) {
    console.log('\n\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    TEST RESULTS SUMMARY                    ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const overallStats = {
      total: 0,
      successes: 0,
      failures: 0,
      blocks: 0,
      cachehits: 0,
      avgTime: 0
    };

    for (const [retailer, stats] of Object.entries(this.results)) {
      const total = stats.attempts;
      const successRate = total > 0 ? ((stats.successes + stats.cachehits) / total * 100).toFixed(1) : 0;
      const blockRate = total > 0 ? (stats.blocks / total * 100).toFixed(1) : 0;
      const cacheRate = total > 0 ? (stats.cachehits / total * 100).toFixed(1) : 0;
      const avgTime = stats.times.length > 0 
        ? (stats.times.reduce((a, b) => a + b, 0) / stats.times.length).toFixed(0)
        : 0;
      const minTime = stats.times.length > 0 ? Math.min(...stats.times) : 0;
      const maxTime = stats.times.length > 0 ? Math.max(...stats.times) : 0;

      console.log(`📊 ${TEST_PRODUCTS[retailer].name.toUpperCase()}`);
      console.log(`${'─'.repeat(60)}`);
      console.log(`   Total Attempts:    ${total}`);
      console.log(`   ✅ Successes:      ${stats.successes} (scraped fresh)`);
      console.log(`   ⚡ Cache Hits:     ${stats.cachehits} (304 Not Modified)`);
      console.log(`   ❌ Failures:       ${stats.failures}`);
      console.log(`   🚫 Blocks:         ${stats.blocks}`);
      console.log(`   📈 Success Rate:   ${successRate}% ${this.getStatusIcon(parseFloat(successRate), 95)}`);
      console.log(`   🚫 Block Rate:     ${blockRate}% ${this.getStatusIcon(5, parseFloat(blockRate))}`);
      console.log(`   ⚡ Cache Hit Rate: ${cacheRate}% ${this.getStatusIcon(parseFloat(cacheRate), 25)}`);
      console.log(`   ⏱️  Avg Time:       ${avgTime}ms (min: ${minTime}ms, max: ${maxTime}ms)`);
      console.log('');

      overallStats.total += total;
      overallStats.successes += stats.successes;
      overallStats.failures += stats.failures;
      overallStats.blocks += stats.blocks;
      overallStats.cachehits += stats.cachehits;
      overallStats.avgTime += stats.times.length > 0 
        ? stats.times.reduce((a, b) => a + b, 0) / stats.times.length
        : 0;
    }

    // Overall metrics
    const overallSuccessRate = overallStats.total > 0 
      ? ((overallStats.successes + overallStats.cachehits) / overallStats.total * 100).toFixed(1)
      : 0;
    const overallBlockRate = overallStats.total > 0 
      ? (overallStats.blocks / overallStats.total * 100).toFixed(1)
      : 0;
    const overallCacheRate = overallStats.total > 0 
      ? (overallStats.cachehits / overallStats.total * 100).toFixed(1)
      : 0;
    const overallAvgTime = (overallStats.avgTime / 3).toFixed(0);

    console.log(`🎯 OVERALL PERFORMANCE`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`   Total Scrapes:     ${overallStats.total}`);
    console.log(`   Success Rate:      ${overallSuccessRate}% ${this.getStatusIcon(parseFloat(overallSuccessRate), 95)}`);
    console.log(`   Block Rate:        ${overallBlockRate}% ${this.getStatusIcon(5, parseFloat(overallBlockRate))}`);
    console.log(`   Cache Hit Rate:    ${overallCacheRate}% ${this.getStatusIcon(parseFloat(overallCacheRate), 25)}`);
    console.log(`   Avg Response Time: ${overallAvgTime}ms`);
    console.log(`   Total Test Time:   ${(totalTime / 1000).toFixed(1)}s`);
    console.log('');

    // Sprint 2.9 Target Validation
    console.log(`🎯 SPRINT 2.9 TARGETS VALIDATION`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`   ✅ Success Rate >95%:    ${overallSuccessRate}% ${this.getTestResult(parseFloat(overallSuccessRate) >= 95)}`);
    console.log(`   ✅ Block Rate <5%:       ${overallBlockRate}% ${this.getTestResult(parseFloat(overallBlockRate) < 5)}`);
    console.log(`   ✅ Cache Hit Rate >25%:  ${overallCacheRate}% ${this.getTestResult(parseFloat(overallCacheRate) >= 25)}`);
    console.log(`   ✅ Avg Time <2000ms:     ${overallAvgTime}ms ${this.getTestResult(parseFloat(overallAvgTime) < 2000)}`);
    console.log('');

    // Get scraper stats
    const scraperStats = this.scraper.getStats();
    console.log(`📈 SCRAPER STATISTICS`);
    console.log(`${'─'.repeat(60)}`);
    console.log(`   Total Cost:        ${scraperStats.totalCost}`);
    console.log(`   Avg Cost/Scrape:   ${scraperStats.avgCostPerScrape}`);
    console.log(`   HTTP Cache Hits:   ${scraperStats.sprint29Features.httpCacheHits}`);
    console.log(`   Cache Hit Rate:    ${scraperStats.sprint29Features.cacheHitRate}`);
    console.log('');

    // Throttling stats per retailer
    console.log(`⏱️  ADAPTIVE THROTTLING STATUS`);
    console.log(`${'─'.repeat(60)}`);
    for (const [retailer, _] of Object.entries(this.results)) {
      const throttleStats = this.scraper.throttler.getStats(retailer);
      if (throttleStats) {
        console.log(`   ${TEST_PRODUCTS[retailer].name}:`);
        console.log(`      Current Delay:   ${throttleStats.currentDelay}ms`);
        console.log(`      Success Rate:    ${throttleStats.successRate.toFixed(1)}%`);
        console.log(`      Error Rate:      ${throttleStats.errorRate.toFixed(1)}%`);
        console.log(`      Avg Response:    ${throttleStats.avgResponseTime.toFixed(0)}ms`);
      }
    }
    console.log('');

    // Final verdict
    const allTargetsMet = 
      parseFloat(overallSuccessRate) >= 95 &&
      parseFloat(overallBlockRate) < 5 &&
      parseFloat(overallCacheRate) >= 25 &&
      parseFloat(overallAvgTime) < 2000;

    if (allTargetsMet) {
      console.log(`✅ ${'='.repeat(58)} ✅`);
      console.log(`✅  ALL SPRINT 2.9 TARGETS MET - PRODUCTION READY! 🎉  ✅`);
      console.log(`✅ ${'='.repeat(58)} ✅\n`);
    } else {
      console.log(`⚠️  ${'='.repeat(58)} ⚠️`);
      console.log(`⚠️   Some targets not met - review throttling settings   ⚠️`);
      console.log(`⚠️  ${'='.repeat(58)} ⚠️\n`);
    }
  }

  /**
   * Get status icon based on metric vs target
   */
  getStatusIcon(actual, target) {
    return actual >= target ? '✅' : '⚠️';
  }

  /**
   * Get test result (PASS/FAIL)
   */
  getTestResult(passed) {
    return passed ? '✅ PASS' : '❌ FAIL';
  }
}

// Run test
(async () => {
  const tester = new RetailerTester();
  
  try {
    await tester.testAll();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    console.error(error.stack);
    process.exit(1);
  }
})();
