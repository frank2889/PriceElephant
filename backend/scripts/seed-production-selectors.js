/**
 * Seed learned selectors to production database
 * Run this after deploying to Railway to add known good selectors
 * 
 * Usage: npm run db:seed:production
 * Or on Railway: railway run npm run db:seed:production
 */

const db = require('../config/database');

const KNOWN_SELECTORS = [
  // hifi.eu - Magento-based audio equipment store
  {
    domain: 'hifi.eu',
    field_name: 'price',
    css_selector: '.price-box .price, .special-price .price, [data-price-type="finalPrice"]',
    learned_from: 'manual',
    example_value: '138.95'
  },
  {
    domain: 'hifi.eu',
    field_name: 'originalPrice',
    css_selector: '.old-price .price, .price-box .old-price',
    learned_from: 'manual',
    example_value: '149.00'
  },
  {
    domain: 'hifi.eu',
    field_name: 'title',
    css_selector: 'h1.page-title, .product-info-main .page-title, h1',
    learned_from: 'manual',
    example_value: 'Esse WS - Zwart'
  },
  {
    domain: 'hifi.eu',
    field_name: 'brand',
    css_selector: '.product-brand, [itemprop="brand"], .manufacturer',
    learned_from: 'manual',
    example_value: 'NORSTONE'
  }
  // Add more domains here as they are learned
];

async function seedProductionSelectors() {
  console.log('🌱 Seeding learned selectors to production database\n');
  
  try {
    // Check if table exists
    const hasTable = await db.schema.hasTable('learned_selectors');
    if (!hasTable) {
      console.log('❌ ERROR: learned_selectors table does not exist');
      console.log('Run migrations first: npm run db:migrate');
      process.exit(1);
    }
    
    console.log('✅ learned_selectors table exists\n');
    
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    
    for (const selector of KNOWN_SELECTORS) {
      // Check if selector already exists
      const existing = await db('learned_selectors')
        .where({
          domain: selector.domain,
          field_name: selector.field_name,
          css_selector: selector.css_selector
        })
        .first();
      
      if (existing) {
        console.log(`⏭️  ${selector.domain}.${selector.field_name} - Already exists (skipping)`);
        skipped++;
        continue;
      }
      
      // Insert new selector
      await db('learned_selectors').insert({
        domain: selector.domain,
        field_name: selector.field_name,
        css_selector: selector.css_selector,
        selector_type: 'css',
        success_count: 1,
        failure_count: 0,
        success_rate: 100.00,
        learned_from: selector.learned_from,
        example_value: selector.example_value,
        first_seen: db.fn.now(),
        last_used: db.fn.now(),
        last_success: db.fn.now(),
        updated_at: db.fn.now()
      });
      
      console.log(`✅ ${selector.domain}.${selector.field_name} - Inserted`);
      inserted++;
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`  Inserted: ${inserted}`);
    console.log(`  Skipped: ${skipped}`);
    console.log(`  Total: ${KNOWN_SELECTORS.length}`);
    
    // Verify
    const total = await db('learned_selectors').count('* as count').first();
    const domains = await db('learned_selectors')
      .distinct('domain')
      .select('domain');
    
    console.log(`\n📚 Database Stats:`);
    console.log(`  Total Selectors: ${total.count}`);
    console.log(`  Total Domains: ${domains.length}`);
    console.log(`  Domains: ${domains.map(d => d.domain).join(', ')}`);
    
    console.log('\n✅ Production selectors seeded successfully!');
    
  } catch (error) {
    console.error('\n❌ Error seeding selectors:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

// Run if called directly
if (require.main === module) {
  seedProductionSelectors();
}

module.exports = seedProductionSelectors;
