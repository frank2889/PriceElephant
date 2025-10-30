/**
 * Test self-learning scraper on hifi.eu URL
 * 
 * Test flow:
 * 1. First scrape: Will likely use AI Vision (no learned selectors yet)
 * 2. AI Vision extracts selectors and saves them
 * 3. Second scrape: Should use learned selectors (fast & free!)
 */

require('dotenv').config();
const HybridScraper = require('../crawlers/hybrid-scraper');
const SelectorLearning = require('../services/selector-learning');

async function testSelfLearningScraper() {
  const scraper = new HybridScraper();
  
  const testUrl = 'https://www.hifi.eu/nl/esse-ws-zwart.html?srsltid=AfmBOoqzWh9TXImr5ig96tsWRrVyxTO01T5GesnEhajfa2B4b3JwDPPR';
  const domain = 'hifi.eu';
  
  console.log('🧪 Testing Self-Learning Scraper on hifi.eu\n');
  console.log('URL:', testUrl);
  console.log('Domain:', domain);
  console.log('');
  
  try {
    // Check if we have learned selectors already
    console.log('📚 Checking for learned selectors...');
    const existing = await SelectorLearning.getLearnedSelectors(domain, 'price', 5);
    console.log(`Found ${existing.length} existing selectors for ${domain}.price`);
    if (existing.length > 0) {
      existing.forEach((s, i) => {
        console.log(`  ${i+1}. ${s.css_selector} (${s.success_rate}% success, used ${s.success_count} times)`);
      });
    }
    console.log('');
    
    // First scrape
    console.log('🎯 FIRST SCRAPE: Testing current scraper...\n');
    const result1 = await scraper.scrapeProduct(testUrl, {
      customerId: 'test-customer',
      productId: 'test-product',
      verbose: true
    });
    
    console.log('\n✅ First Scrape Result:');
    console.log(`  Method: ${result1.tier}`);
    console.log(`  Price: €${result1.price}`);
    console.log(`  Cost: €${result1.cost}`);
    console.log(`  Title: ${result1.title}`);
    if (result1.usedSelector) {
      console.log(`  Used Selector: ${result1.usedSelector}`);
    }
    
    // Wait a moment
    console.log('\n⏳ Waiting 3 seconds...\n');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check learned selectors after first scrape
    console.log('📚 Checking learned selectors after first scrape...');
    const learnedAfter = await SelectorLearning.getLearnedSelectors(domain, 'price', 5);
    console.log(`Now have ${learnedAfter.length} selectors for ${domain}.price`);
    if (learnedAfter.length > 0) {
      learnedAfter.forEach((s, i) => {
        console.log(`  ${i+1}. ${s.css_selector} (${s.success_rate}% success, learned from ${s.learned_from})`);
      });
    }
    console.log('');
    
    // Second scrape - should use learned selectors!
    console.log('🎯 SECOND SCRAPE: Testing if it learned...\n');
    const scraper2 = new HybridScraper();
    const result2 = await scraper2.scrapeProduct(testUrl, {
      customerId: 'test-customer-2',
      productId: 'test-product-2',
      verbose: true
    });
    
    console.log('\n✅ Second Scrape Result:');
    console.log(`  Method: ${result2.tier}`);
    console.log(`  Price: €${result2.price}`);
    console.log(`  Cost: €${result2.cost}`);
    console.log(`  Title: ${result2.title}`);
    if (result2.usedSelector) {
      console.log(`  Used Selector: ${result2.usedSelector}`);
    }
    
    // Compare
    console.log('\n📊 COMPARISON:');
    console.log(`  First:  ${result1.tier} (€${result1.cost})`);
    console.log(`  Second: ${result2.tier} (€${result2.cost})`);
    
    if (result1.tier === 'ai-vision' && result2.tier !== 'ai-vision') {
      console.log('\n🎉 SUCCESS! Scraper learned from AI Vision and now uses CSS selectors!');
      console.log(`   Cost reduction: €${result1.cost} → €${result2.cost} (${((1 - result2.cost/result1.cost) * 100).toFixed(0)}% cheaper)`);
    } else if (result2.tier === result1.tier) {
      console.log('\n⚠️  Same method used both times. Check if selectors were saved correctly.');
    } else {
      console.log('\n✅ Different method, but may still be optimized.');
    }
    
    // Show learning stats
    console.log('\n� Learning System Stats:');
    const stats = await SelectorLearning.getStats();
    console.log(`  Total Domains: ${stats.totalDomains}`);
    console.log(`  Total Selectors: ${stats.totalSelectors}`);
    console.log(`  Avg Success Rate: ${stats.avgSuccessRate?.toFixed(1)}%`);
    console.log(`  AI-Discovered: ${stats.aiDiscovered}`);
    console.log(`  Total Successes: ${stats.totalSuccesses}`);
    
    await scraper.close();
    await scraper2.close();
    
  } catch (error) {
    console.error('\n❌ Test Error:', error.message);
    console.error(error.stack);
  } finally {
    await scraper.close();
    process.exit(0);
  }
}

testSelfLearningScraper();
