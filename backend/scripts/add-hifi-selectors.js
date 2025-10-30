/**
 * Manually add learned selectors for hifi.eu based on inspecting their HTML
 * This is faster than waiting for AI Vision to discover them
 */

require('dotenv').config();
const SelectorLearning = require('../services/selector-learning');

async function addHifiSelectors() {
  console.log('🔧 Manually adding selectors for hifi.eu\n');
  
  const domain = 'hifi.eu';
  
  // Based on the webpage inspection, hifi.eu uses these selectors:
  const selectors = [
    {
      field: 'price',
      selector: '.price-box .price, .special-price .price, [data-price-type="finalPrice"]',
      example: '138.95',
      note: 'Magento-based site - uses standard Magento price selectors'
    },
    {
      field: 'originalPrice',
      selector: '.old-price .price, .price-box .old-price',
      example: '149.00',
      note: 'Original price before discount'
    },
    {
      field: 'title',
      selector: 'h1.page-title, .product-info-main .page-title, h1',
      example: 'Esse WS - Zwart',
      note: 'Product title - standard Magento structure'
    },
    {
      field: 'brand',
      selector: '.product-brand, [itemprop="brand"], .manufacturer',
      example: 'NORSTONE',
      note: 'Brand/manufacturer'
    }
  ];
  
  // Add each selector to the learning system
  for (const sel of selectors) {
    console.log(`Adding ${domain}.${sel.field}:`);
    console.log(`  Selector: ${sel.selector}`);
    console.log(`  Example: ${sel.example}`);
    console.log(`  Note: ${sel.note}`);
    
    await SelectorLearning.recordSuccess(
      domain,
      sel.field,
      sel.selector,
      sel.example,
      'manual' // Source: manually added
    );
    
    console.log(`  ✅ Added\n`);
  }
  
  // Verify what we added
  console.log('📚 Verifying learned selectors for hifi.eu:\n');
  
  const priceSelectors = await SelectorLearning.getLearnedSelectors(domain, 'price', 5);
  console.log(`Price selectors (${priceSelectors.length}):`);
  priceSelectors.forEach((s, i) => {
    console.log(`  ${i+1}. ${s.css_selector}`);
    console.log(`     Success rate: ${s.success_rate}%, Used: ${s.success_count} times`);
    console.log(`     Learned from: ${s.learned_from}\n`);
  });
  
  // Show stats
  const stats = await SelectorLearning.getStats();
  console.log('📈 Overall Learning Stats:');
  console.log(`  Total Domains: ${stats.totalDomains}`);
  console.log(`  Total Selectors: ${stats.totalSelectors}`);
  console.log(`  Avg Success Rate: ${stats.avgSuccessRate?.toFixed(1)}%`);
  console.log(`  Manual Entries: ${stats.totalSelectors - stats.aiDiscovered}`);
  console.log(`  AI-Discovered: ${stats.aiDiscovered}`);
  
  console.log('\n✅ Done! The scraper will now use these selectors for hifi.eu');
  console.log('💡 Next scrape of hifi.eu will be fast and free (no AI Vision needed)');
  
  // Close database connection properly
  const db = require('../config/database');
  await db.destroy();
  console.log('🔌 Database connection closed');
}

addHifiSelectors().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});

