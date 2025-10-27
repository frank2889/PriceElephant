/**
 * Test variant grouping on Emmso feed
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const ChannableIntegration = require('../integrations/channable');
const VariantGrouping = require('../utils/variant-grouping');

const EMMSO_FEED_URL = 'https://emmso.eu/collections/google-feed-nl';

async function testVariantGrouping() {
  try {
    console.log('🔍 Analyzing Emmso feed for variant patterns...\n');

    // Download feed
    const channable = new ChannableIntegration({ feedUrl: EMMSO_FEED_URL });
    const products = await channable.importFromFeed();
    
    console.log(`📦 Loaded ${products.length} products\n`);

    // Analyze variant patterns
    const analysis = VariantGrouping.analyzeVariantPatterns(products);

    console.log('📊 VARIANT ANALYSIS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total products in feed:       ${analysis.stats.totalProducts}`);
    console.log(`Unique base products:         ${analysis.stats.totalGroups}`);
    console.log(`Products with variants:       ${analysis.stats.productsWithVariants}`);
    console.log(`Largest variant count:        ${analysis.stats.largestVariantCount}`);
    console.log(`Single products (no variants):${analysis.singleProducts}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('📈 Variant Distribution:');
    Object.entries(analysis.stats.variantDistribution)
      .sort((a, b) => parseInt(b[0]) - parseInt(a[0]))
      .forEach(([count, frequency]) => {
        const bar = '█'.repeat(Math.min(frequency / 2, 50));
        console.log(`  ${count.padStart(2)} variants: ${frequency.toString().padStart(3)} products ${bar}`);
      });

    console.log('\n\n🔍 Example Product Groups with Variants:\n');
    
    analysis.groups.slice(0, 5).forEach((group, i) => {
      console.log(`${i + 1}. ${group.baseName}`);
      console.log(`   Brand: ${group.brand || 'N/A'}`);
      console.log(`   Variants: ${group.variants.length}`);
      
      group.variants.forEach((variant, j) => {
        const info = variant.variantInfo;
        const details = [];
        if (info.color) details.push(`Kleur: ${info.color}`);
        if (info.size) details.push(`Maat: ${info.size}`);
        if (info.type) details.push(`Type: ${info.type}`);
        
        console.log(`   ${j + 1}) €${variant.price} - ${details.join(', ') || 'Standaard'}`);
        console.log(`      EAN: ${variant.ean || 'N/A'}`);
      });
      console.log('');
    });

    // Test Shopify variant structure generation
    console.log('\n📦 Shopify Variant Structure Example:\n');
    const exampleGroup = analysis.groups[0];
    if (exampleGroup) {
      const shopifyVariants = VariantGrouping.createShopifyVariants(exampleGroup);
      
      console.log(`Product: ${exampleGroup.baseName}`);
      console.log(`\nOptions:`);
      shopifyVariants.options.forEach((opt, i) => {
        console.log(`  ${i + 1}. ${opt.name}: ${opt.values.join(', ')}`);
      });
      
      console.log(`\nVariants (${shopifyVariants.variants.length}):`);
      shopifyVariants.variants.forEach((v, i) => {
        console.log(`  ${i + 1}. ${v.title}`);
        console.log(`     Price: €${v.price}`);
        console.log(`     SKU: ${v.sku}`);
        console.log(`     Options: ${v.option1}${v.option2 ? ' / ' + v.option2 : ''}${v.option3 ? ' / ' + v.option3 : ''}`);
      });
    }

    console.log('\n✅ Variant grouping analysis complete!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testVariantGrouping()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
