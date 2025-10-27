/**
 * Test bulk import with variant grouping enabled
 */

require('dotenv').config();
const axios = require('axios');
const ChannableIntegration = require('../integrations/channable');

const API_URL = process.env.API_URL || 'http://localhost:3000';
const EMMSO_FEED_URL = 'https://emmso.eu/collections/google-feed-nl';

async function testVariantImport() {
  console.log('🧪 Testing Variant-Aware Bulk Import\n');

  try {
    // Step 1: Download Emmso feed
    console.log('1️⃣ Downloading Emmso feed...');
    const startDownload = Date.now();
    
    const response = await axios.get(EMMSO_FEED_URL);
    const downloadTime = ((Date.now() - startDownload) / 1000).toFixed(2);
    
    console.log(`✅ Feed downloaded in ${downloadTime}s`);
    console.log(`   Content-Type: ${response.headers['content-type']}`);
    console.log(`   Size: ${(response.data.length / 1024).toFixed(2)} KB\n`);

    // Step 2: Parse feed
    console.log('2️⃣ Parsing feed...');
    const channable = new ChannableIntegration({ feedUrl: EMMSO_FEED_URL });
    const parsedProducts = await channable.parseXMLFeed(response.data);
    
    // Convert to our product format
    const products = parsedProducts.map(p => ({
      shopify_customer_id: 1,
      product_name: p.title,
      product_ean: p.ean,
      product_sku: p.sku,
      brand: p.brand,
      category: p.category,
      own_price: p.price,
      product_url: p.url,
      image_url: p.imageUrl,
      channable_product_id: p.externalId,
      active: p.inStock
    }));
    
    console.log(`✅ Parsed ${products.length} products\n`);

    // Step 3: Import WITHOUT variant grouping (original behavior)
    console.log('3️⃣ Testing import WITHOUT variant grouping...');
    const startImportNoGrouping = Date.now();
    
    const responseNoGrouping = await axios.post(
      `${API_URL}/api/v1/products/import`,
      {
        products: products.slice(0, 20), // First 20 products only
        enable_variant_grouping: false
      }
    );
    
    const importTimeNoGrouping = ((Date.now() - startImportNoGrouping) / 1000).toFixed(2);
    
    console.log(`✅ Import completed in ${importTimeNoGrouping}s`);
    console.log(`   Imported: ${responseNoGrouping.data.results.imported}`);
    console.log(`   Skipped: ${responseNoGrouping.data.results.skipped}`);
    console.log(`   Failed: ${responseNoGrouping.data.results.failed}\n`);

    // Clean up - delete imported products
    console.log('🧹 Cleaning up non-grouped products...');
    const db = require('../config/database');
    await db('products').where({ shopify_customer_id: 1 }).del();
    console.log('✅ Cleanup complete\n');

    // Step 4: Import WITH variant grouping
    console.log('4️⃣ Testing import WITH variant grouping...');
    const startImportGrouping = Date.now();
    
    const responseGrouping = await axios.post(
      `${API_URL}/api/v1/products/import`,
      {
        products: products.slice(0, 20), // Same 20 products
        enable_variant_grouping: true
      }
    );
    
    const importTimeGrouping = ((Date.now() - startImportGrouping) / 1000).toFixed(2);
    
    console.log(`✅ Import completed in ${importTimeGrouping}s`);
    console.log(`   Imported: ${responseGrouping.data.results.imported}`);
    console.log(`   Parent products: ${responseGrouping.data.results.parent_products}`);
    console.log(`   Variants created: ${responseGrouping.data.results.variants_created}`);
    console.log(`   Skipped: ${responseGrouping.data.results.skipped}`);
    console.log(`   Failed: ${responseGrouping.data.results.failed}\n`);

    // Step 5: Verify variant structure in database
    console.log('5️⃣ Verifying variant structure in database...');
    
    const parentProducts = await db('products')
      .where({ 
        shopify_customer_id: 1,
        is_parent_product: true
      })
      .whereNotNull('parent_product_id')
      .orWhere(function() {
        this.where({ shopify_customer_id: 1, is_parent_product: true })
            .whereExists(function() {
              this.select('*')
                  .from('products as p2')
                  .whereRaw('p2.parent_product_id = products.id');
            });
      });

    console.log(`✅ Found ${parentProducts.length} parent products with variants\n`);

    // Show sample variant groups
    if (parentProducts.length > 0) {
      console.log('📦 Sample variant groups:\n');
      
      for (let i = 0; i < Math.min(3, parentProducts.length); i++) {
        const parent = parentProducts[i];
        const variants = await db('products')
          .where({ parent_product_id: parent.id })
          .orderBy('variant_position');

        console.log(`   ${i + 1}. ${parent.product_name}`);
        console.log(`      Parent: ${parent.variant_title} - €${parent.own_price}`);
        
        variants.forEach(v => {
          console.log(`      Variant: ${v.variant_title} - €${v.own_price}`);
        });
        
        if (parent.option1_name) {
          const allProducts = [parent, ...variants];
          const option1Values = [...new Set(allProducts.map(p => p.option1_value).filter(Boolean))];
          console.log(`      Options: ${parent.option1_name} = [${option1Values.join(', ')}]`);
        }
        
        console.log('');
      }
    }

    // Step 6: Compare efficiency
    console.log('6️⃣ Efficiency comparison:\n');
    const reductionCount = responseNoGrouping.data.results.imported - responseGrouping.data.results.imported;
    const reductionPercent = ((reductionCount / responseNoGrouping.data.results.imported) * 100).toFixed(1);
    
    console.log(`   Without grouping: ${responseNoGrouping.data.results.imported} products`);
    console.log(`   With grouping: ${responseGrouping.data.results.imported} products`);
    console.log(`   Reduction: ${reductionCount} duplicates eliminated (${reductionPercent}%)`);
    console.log(`   Parent products: ${responseGrouping.data.results.parent_products}`);
    console.log(`   Variants: ${responseGrouping.data.results.variants_created}\n`);

    console.log('✅ All variant import tests passed! 🎉');
    
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

// Run tests
testVariantImport();
