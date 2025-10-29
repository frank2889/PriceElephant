/**
 * Sync Enterprise Tier to Database
 * Run this locally with production DATABASE_URL
 * 
 * Usage: 
 * DATABASE_URL="postgresql://..." node backend/scripts/sync-enterprise-tier.js
 */

require('dotenv').config();

const knex = require('knex')({
  client: 'postgresql',
  connection: process.env.DATABASE_URL || process.env.PRODUCTION_DATABASE_URL
});

async function syncEnterpriseTier() {
  try {
    console.log('🔄 Syncing enterprise tier to database...');
    
    const customerId = '8557353828568'; // Hobo.nl
    
    await knex('customer_tiers')
      .insert({
        customer_id: customerId,
        tier: 'enterprise',
        product_limit: 0, // 0 = unlimited
        competitor_limit: 0, // 0 = unlimited
        api_access: true,
        monthly_price: 249.00,
        created_at: new Date(),
        updated_at: new Date()
      })
      .onConflict('customer_id')
      .merge({
        tier: 'enterprise',
        product_limit: 0,
        competitor_limit: 0,
        api_access: true,
        monthly_price: 249.00,
        updated_at: new Date()
      });
    
    console.log('✅ Enterprise tier synced successfully!');
    
    // Verify
    const tier = await knex('customer_tiers')
      .where({ customer_id: customerId })
      .first();
    
    console.log('📊 Current tier in database:', tier);
    console.log('\n✨ Now refresh the dashboard to see unlimited products!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await knex.destroy();
  }
}

syncEnterpriseTier();
