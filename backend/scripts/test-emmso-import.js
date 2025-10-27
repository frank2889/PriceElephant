/**
 * Test Emmso feed import - 622 products bulk import test
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const axios = require('axios');
const ChannableIntegration = require('../integrations/channable');
const db = require('../config/database');

const EMMSO_FEED_URL = 'https://emmso.eu/collections/google-feed-nl';
const CUSTOMER_ID = 1;

async function testEmmsoImport() {
  try {
    console.log('🚀 Starting Emmso feed import test...\n');
    console.log(`📡 Feed URL: ${EMMSO_FEED_URL}`);
    console.log(`👤 Customer ID: ${CUSTOMER_ID}\n`);

    // Step 1: Download and parse feed
    console.log('⏳ Downloading feed...');
    const startDownload = Date.now();
    
    const channable = new ChannableIntegration({
      feedUrl: EMMSO_FEED_URL
    });

    const products = await channable.importFromFeed();
    const downloadTime = ((Date.now() - startDownload) / 1000).toFixed(2);
    
    console.log(`✅ Downloaded and parsed ${products.length} products in ${downloadTime}s\n`);

    // Step 2: Show sample products
    console.log('📦 Sample products (first 3):');
    products.slice(0, 3).forEach((p, i) => {
      console.log(`\n${i + 1}. ${p.title}`);
      console.log(`   EAN: ${p.ean || 'N/A'}`);
      console.log(`   Price: €${p.price}`);
      console.log(`   Brand: ${p.brand || 'N/A'}`);
      console.log(`   In Stock: ${p.inStock ? 'Yes' : 'No'}`);
    });

    // Step 3: Import to database
    console.log('\n\n⏳ Importing to database...');
    const startImport = Date.now();

    const stats = {
      imported: 0,
      skipped: 0,
      failed: 0,
      errors: []
    };

    for (const product of products) {
      try {
        // Skip products without EAN
        if (!product.ean) {
          stats.skipped++;
          continue;
        }

        // Check if product exists
        const existing = await db('products')
          .where({ 
            product_ean: product.ean, 
            shopify_customer_id: CUSTOMER_ID 
          })
          .first();

        if (existing) {
          stats.skipped++;
          continue;
        }

        // Insert product
        await db('products').insert({
          shopify_customer_id: CUSTOMER_ID,
          product_name: product.title.substring(0, 500), // Limit to 500 chars
          product_ean: product.ean,
          product_sku: product.sku,
          brand: product.brand?.substring(0, 200),
          category: product.category?.substring(0, 200),
          own_price: product.price,
          product_url: product.url,
          image_url: product.imageUrl,
          channable_product_id: product.externalId,
          active: product.inStock
        });

        stats.imported++;

        // Progress indicator every 50 products
        if (stats.imported % 50 === 0) {
          console.log(`   📊 Progress: ${stats.imported} imported, ${stats.skipped} skipped`);
        }

      } catch (error) {
        stats.failed++;
        stats.errors.push({
          product: product.title,
          error: error.message
        });

        if (stats.failed <= 5) {
          console.error(`   ❌ Failed: ${product.title} - ${error.message}`);
        }
      }
    }

    const importTime = ((Date.now() - startImport) / 1000).toFixed(2);

    // Step 4: Results
    console.log('\n\n📊 IMPORT RESULTS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total products in feed:  ${products.length}`);
    console.log(`✅ Successfully imported: ${stats.imported}`);
    console.log(`⏭️  Skipped (duplicates):  ${stats.skipped}`);
    console.log(`❌ Failed:                ${stats.failed}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`⏱️  Download time:         ${downloadTime}s`);
    console.log(`⏱️  Import time:           ${importTime}s`);
    console.log(`⏱️  Total time:            ${((Date.now() - startDownload) / 1000).toFixed(2)}s`);
    console.log(`📈 Import rate:           ${(stats.imported / parseFloat(importTime)).toFixed(1)} products/second`);

    if (stats.errors.length > 0) {
      console.log('\n❌ Errors:');
      stats.errors.slice(0, 10).forEach(e => {
        console.log(`   - ${e.product}: ${e.error}`);
      });
      if (stats.errors.length > 10) {
        console.log(`   ... and ${stats.errors.length - 10} more errors`);
      }
    }

    // Step 5: Verify in database
    const dbCount = await db('products')
      .where({ shopify_customer_id: CUSTOMER_ID })
      .count('* as count')
      .first();

    console.log(`\n✅ Total products in database for customer ${CUSTOMER_ID}: ${dbCount.count}`);

  } catch (error) {
    console.error('❌ Import test failed:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    await db.destroy();
  }
}

testEmmsoImport()
  .then(() => {
    console.log('\n✨ Test completed successfully!');
    process.exit(0);
  })
  .catch(() => {
    console.error('\n💥 Test failed!');
    process.exit(1);
  });
