/**
 * Test Multi-Retailer Scraping
 * Tests Bol.com, Amazon.nl, MediaMarkt with real product URLs
 */

require('dotenv').config();
const HybridScraper = require('../crawlers/hybrid-scraper');

const testProducts = [
  {
    retailer: 'bol',
    url: 'https://www.bol.com/nl/nl/p/apple-iphone-15-128-gb-zwart/9300000165031886/',
    name: 'iPhone 15 128GB - Bol.com'
  },
  {
    retailer: 'bol',
    url: 'https://www.bol.com/nl/nl/p/samsung-galaxy-s24-128gb-zwart/9300000173464719/',
    name: 'Samsung Galaxy S24 - Bol.com'
  },
  {
    retailer: 'amazon',
    url: 'https://www.amazon.nl/dp/B0CHX3TW6S',
    name: 'iPhone 15 - Amazon.nl'
  },
  {
    retailer: 'amazon',
    url: 'https://www.amazon.nl/dp/B0CMDWC5LS',
    name: 'Samsung Galaxy S24 - Amazon.nl'
  },
  {
    retailer: 'mediamarkt',
    url: 'https://www.mediamarkt.nl/nl/product/_apple-iphone-15-128-gb-zwart-1991253.html',
    name: 'iPhone 15 - MediaMarkt'
  },
  {
    retailer: 'mediamarkt',
    url: 'https://www.mediamarkt.nl/nl/product/_samsung-galaxy-s24-128-gb-marble-grey-1991584.html',
    name: 'Samsung Galaxy S24 - MediaMarkt'
  }
];

async function testMultiRetailer() {
  console.log('🧪 Testing Multi-Retailer Scraping\n');
  console.log('=' .repeat(80));
  
  const scraper = new HybridScraper();
  const results = [];

  for (const product of testProducts) {
    console.log(`\n📦 Testing: ${product.name}`);
    console.log(`🔗 URL: ${product.url}`);
    console.log('-'.repeat(80));

    try {
      const result = await scraper.scrapeProduct(product.url, null, product.retailer);
      
      console.log(`✅ SUCCESS`);
      console.log(`   Title: ${result.title}`);
      console.log(`   Price: €${result.price}`);
      console.log(`   In Stock: ${result.inStock ? 'Yes' : 'No'}`);
      console.log(`   Method: ${result.tier}`);
      console.log(`   Cost: €${result.cost}`);
      
      results.push({
        ...product,
        success: true,
        data: result
      });
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}`);
      results.push({
        ...product,
        success: false,
        error: error.message
      });
    }

    // Rate limiting between requests
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 SUMMARY');
  console.log('='.repeat(80));
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`\nTotal products tested: ${results.length}`);
  console.log(`✅ Successful: ${successful.length} (${(successful.length / results.length * 100).toFixed(1)}%)`);
  console.log(`❌ Failed: ${failed.length} (${(failed.length / results.length * 100).toFixed(1)}%)`);
  
  // Stats by retailer
  console.log('\n📈 By Retailer:');
  const retailers = ['bol', 'amazon', 'mediamarkt'];
  retailers.forEach(retailer => {
    const total = results.filter(r => r.retailer === retailer).length;
    const success = results.filter(r => r.retailer === retailer && r.success).length;
    console.log(`   ${retailer.padEnd(12)}: ${success}/${total} (${(success/total*100).toFixed(0)}%)`);
  });
  
  // Stats by tier
  console.log('\n🔧 By Scraping Method:');
  const stats = scraper.getStats();
  console.log(`   Direct (free):     ${stats.directSuccess || 0}`);
  console.log(`   Free Proxy:        ${stats.freeProxySuccess || 0}`);
  console.log(`   WebShare Proxy:    ${stats.paidProxySuccess || 0}`);
  console.log(`   AI Vision:         ${stats.aiVisionSuccess || 0}`);
  console.log(`   Failures:          ${stats.failures || 0}`);
  
  console.log(`\n💰 Total Cost: €${(stats.totalCost || 0).toFixed(4)}`);
  console.log(`   Avg per product: €${((stats.totalCost || 0) / results.length).toFixed(4)}`);
  
  // Failed products details
  if (failed.length > 0) {
    console.log('\n❌ Failed Products:');
    failed.forEach(p => {
      console.log(`   - ${p.name}: ${p.error}`);
    });
  }
  
  console.log('\n' + '='.repeat(80));
  
  // Success criteria check
  const successRate = (successful.length / results.length * 100);
  if (successRate >= 95) {
    console.log('🎉 SUCCESS CRITERIA MET: 95%+ success rate achieved!');
  } else {
    console.log(`⚠️  WARNING: Success rate ${successRate.toFixed(1)}% below 95% target`);
  }
}

testMultiRetailer()
  .then(() => {
    console.log('\n✅ Test complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
