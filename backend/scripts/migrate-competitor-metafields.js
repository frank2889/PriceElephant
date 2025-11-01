/**
 * Migrate Competitor Data to New Metafield Format
 * 
 * This script:
 * 1. Creates the competitor_data metafield definition in Shopify
 * 2. Migrates all existing products with competitors to the new format
 * 
 * Usage: node migrate-competitor-metafields.js
 */

require('dotenv').config();
const db = require('../config/database');
const ShopifyIntegration = require('../integrations/shopify');

async function migrateCompetitorMetafields() {
  console.log('🔄 Starting competitor metafield migration...\n');

  try {
    // Get customer config with Shopify credentials
    const config = await db('customer_configs')
      .where('customer_id', '8557353828568')
      .first();

    if (!config || !config.shopify_domain || !config.shopify_access_token) {
      throw new Error('Shopify credentials not found in customer_configs');
    }

    console.log(`✅ Found Shopify credentials for ${config.shopify_domain}\n`);

    const shopify = new ShopifyIntegration({
      shopDomain: config.shopify_domain,
      accessToken: config.shopify_access_token
    });

    // Step 1: Create metafield definition
    console.log('📋 Step 1: Creating competitor_data metafield definition...');
    
    try {
      // Note: Metafield definitions require GraphQL API
      // For now, the metafield will be created automatically when first used
      console.log('ℹ️  Metafield definition will be created automatically on first use\n');
    } catch (error) {
      console.log('⚠️  Metafield definition creation skipped (will auto-create)\n');
    }

    // Step 2: Get all products with shopify_product_id and competitors
    console.log('📦 Step 2: Finding products with competitors...');
    
    const productsWithCompetitors = await db('products')
      .select('products.id', 'products.shopify_product_id', 'products.product_url', 'products.shopify_customer_id')
      .join('competitor_prices', 'products.id', 'competitor_prices.product_id')
      .whereNotNull('products.shopify_product_id')
      .groupBy('products.id', 'products.shopify_product_id', 'products.product_url', 'products.shopify_customer_id')
      .having(db.raw('count(competitor_prices.id) > 0'));

    console.log(`✅ Found ${productsWithCompetitors.length} products with competitors\n`);

    if (productsWithCompetitors.length === 0) {
      console.log('ℹ️  No products to migrate');
      return;
    }

    // Step 3: Migrate each product
    console.log('🔄 Step 3: Migrating competitor data to new metafield format...\n');
    
    let migrated = 0;
    let skipped = 0;
    let failed = 0;

    for (const product of productsWithCompetitors) {
      try {
        console.log(`  Processing: ${product.shopify_product_id}...`);

        // Get all competitors for this product
        const competitors = await db('competitor_prices')
          .where({ product_id: product.id })
          .select('url', 'retailer', 'price', 'original_price', 'in_stock')
          .orderBy('retailer');

        const competitorData = competitors.map(c => ({
          url: c.url,
          retailer: c.retailer,
          price: parseFloat(c.price),
          original_price: c.original_price ? parseFloat(c.original_price) : null,
          in_stock: c.in_stock
        }));

        // Update metafield
        await shopify.updateCompetitorData(
          product.shopify_product_id,
          product.product_url,
          competitorData
        );

        migrated++;
        console.log(`    ✅ Migrated ${competitors.length} competitors`);

      } catch (error) {
        failed++;
        console.log(`    ❌ Failed: ${error.message}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Migration Summary:');
    console.log('='.repeat(60));
    console.log(`✅ Successfully migrated: ${migrated} products`);
    console.log(`⏭️  Skipped: ${skipped} products`);
    console.log(`❌ Failed: ${failed} products`);
    console.log('='.repeat(60));

    console.log('\n✅ Migration complete!');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

// Run migration
migrateCompetitorMetafields();
