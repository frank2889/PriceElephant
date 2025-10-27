const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('../config/database');
const fs = require('fs');

async function runMigration() {
  try {
    console.log('🔧 Running customer tiers migration...\n');
    
    const sql = fs.readFileSync(
      path.join(__dirname, '../database/migrations/20241027_add_customer_tiers.sql'),
      'utf8'
    );
    
    await db.raw(sql);
    
    console.log('✅ Migration complete!');
    console.log('\n📊 Checking Hobo customer tier...');
    
    const result = await db('customer_tiers')
      .where({ customer_id: 8557353828568 })
      .first();
    
    if (result) {
      console.log('\n🐘 Hobo Customer Settings:');
      console.log('   Tier:', result.tier);
      console.log('   Product limit:', result.product_limit === 0 ? 'Unlimited' : result.product_limit);
      console.log('   Competitor limit:', result.competitor_limit === 0 ? 'Unlimited' : result.competitor_limit);
      console.log('   API access:', result.api_access ? 'Enabled' : 'Disabled');
      console.log('   Monthly price: €' + result.monthly_price);
    }
    
    await db.destroy();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

runMigration();
