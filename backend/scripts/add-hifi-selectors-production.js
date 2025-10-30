/**
 * Add hifi.eu selectors to PRODUCTION (Railway) database
 * This uses the DATABASE_URL from .env to connect to Railway
 */

require('dotenv').config();
const knex = require('knex');

// Use DATABASE_URL from .env (Railway production)
const db = knex({
  client: 'postgresql',
  connection: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function addSelectorsToProduction() {
  console.log('🚀 Adding hifi.eu selectors to PRODUCTION (Railway) database\n');
  console.log('Database:', process.env.DATABASE_URL.replace(/:[^:@]+@/, ':***@'), '\n');
  
  const selectors = [
    {
      domain: 'hifi.eu',
      field_name: 'price',
      css_selector: '.price-box .price, .special-price .price, [data-price-type="finalPrice"]',
      success_count: 1,
      failure_count: 0,
      success_rate: 100.0,
      learned_from: 'manual',
      example_value: '138.95',
      first_seen: new Date(),
      last_used: new Date(),
      last_success: new Date(),
      updated_at: new Date()
    },
    {
      domain: 'hifi.eu',
      field_name: 'originalPrice',
      css_selector: '.old-price .price, .price-box .old-price',
      success_count: 1,
      failure_count: 0,
      success_rate: 100.0,
      learned_from: 'manual',
      example_value: '149.00',
      first_seen: new Date(),
      last_used: new Date(),
      last_success: new Date(),
      updated_at: new Date()
    },
    {
      domain: 'hifi.eu',
      field_name: 'title',
      css_selector: 'h1.page-title, .product-info-main .page-title, h1',
      success_count: 1,
      failure_count: 0,
      success_rate: 100.0,
      learned_from: 'manual',
      example_value: 'Esse WS - Zwart',
      first_seen: new Date(),
      last_used: new Date(),
      last_success: new Date(),
      updated_at: new Date()
    },
    {
      domain: 'hifi.eu',
      field_name: 'brand',
      css_selector: '.product-brand, [itemprop="brand"], .manufacturer',
      success_count: 1,
      failure_count: 0,
      success_rate: 100.0,
      learned_from: 'manual',
      example_value: 'NORSTONE',
      first_seen: new Date(),
      last_used: new Date(),
      last_success: new Date(),
      updated_at: new Date()
    }
  ];
  
  try {
    // Check if table exists
    const hasTable = await db.schema.hasTable('learned_selectors');
    if (!hasTable) {
      console.log('❌ ERROR: learned_selectors table does not exist in production!');
      console.log('You need to run migrations on Railway first:');
      console.log('  railway run npx knex migrate:latest');
      await db.destroy();
      process.exit(1);
    }
    
    console.log('✅ learned_selectors table exists\n');
    
    // Insert all selectors
    for (const selector of selectors) {
      console.log(`Inserting ${selector.domain}.${selector.field_name}...`);
      
      // Use INSERT ... ON CONFLICT to handle duplicates
      await db.raw(`
        INSERT INTO learned_selectors (
          domain, field_name, css_selector, success_count, failure_count,
          success_rate, learned_from, example_value, first_seen, last_used, last_success, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (domain, field_name, css_selector) 
        DO UPDATE SET
          success_count = learned_selectors.success_count + 1,
          success_rate = ((learned_selectors.success_count + 1.0) / 
                         (learned_selectors.success_count + learned_selectors.failure_count + 1.0) * 100),
          last_used = EXCLUDED.last_used,
          last_success = EXCLUDED.last_success,
          updated_at = EXCLUDED.updated_at
      `, [
        selector.domain,
        selector.field_name,
        selector.css_selector,
        selector.success_count,
        selector.failure_count,
        selector.success_rate,
        selector.learned_from,
        selector.example_value,
        selector.first_seen,
        selector.last_used,
        selector.last_success,
        selector.updated_at
      ]);
      
      console.log(`  ✅ Inserted\n`);
    }
    
    // Verify
    console.log('📚 Verifying inserted data in PRODUCTION:\n');
    const results = await db('learned_selectors')
      .where({ domain: 'hifi.eu' })
      .select('*');
    
    console.log(`Found ${results.length} selectors for hifi.eu in production:`);
    results.forEach(r => {
      console.log(`  ${r.field_name}: ${r.css_selector.substring(0, 50)}...`);
      console.log(`    Success rate: ${r.success_rate}%`);
      console.log(`    Learned from: ${r.learned_from}\n`);
    });
    
    console.log('✅ All selectors added to PRODUCTION successfully!');
    console.log('🎉 Next scrape of hifi.eu will use these selectors (€0.00 instead of €0.02)');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await db.destroy();
    console.log('\n🔌 Database connection closed');
  }
}

addSelectorsToProduction();
