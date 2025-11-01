const axios = require('axios');
const db = require('../config/database');

const customerId = '8557353828568';

(async () => {
  try {
    // Get customer config
    const customer = await db('customer_configs')
      .where({ customer_id: customerId })
      .first();
    
    if (!customer || !customer.shopify_domain || !customer.shopify_access_token) {
      console.error('❌ Customer config incomplete');
      process.exit(1);
    }
    
    console.log(`🏪 Checking Shopify: ${customer.shopify_domain}\n`);
    
    // Get all Shopify products
    const shopifyUrl = `https://${customer.shopify_domain}/admin/api/2024-01/products.json?limit=250`;
    const response = await axios.get(shopifyUrl, {
      headers: {
        'X-Shopify-Access-Token': customer.shopify_access_token
      }
    });
    
    const shopifyProducts = response.data.products;
    console.log(`📦 Products in Shopify: ${shopifyProducts.length}\n`);
    
    shopifyProducts.forEach((p, i) => {
      console.log(`  ${i+1}. ${p.title.substring(0, 50).padEnd(50)} - ID: ${p.id}`);
    });
    
    // Get PriceElephant products
    const peResponse = await axios.get(`https://web-production-2568.up.railway.app/api/v1/products/${customerId}?limit=100`);
    const peProducts = peResponse.data.products;
    
    console.log(`\n📊 Products in PriceElephant DB: ${peProducts.length}\n`);
    
    // Compare
    const shopifyIds = new Set(shopifyProducts.map(p => p.id.toString()));
    const peShopifyIds = peProducts.map(p => p.shopify_product_id?.toString()).filter(Boolean);
    
    console.log('🔍 Comparison:');
    console.log('='.repeat(80));
    
    let orphaned = 0;
    peProducts.forEach(p => {
      const sid = p.shopify_product_id?.toString();
      const exists = sid && shopifyIds.has(sid);
      const status = exists ? '✅' : '❌ ORPHANED';
      console.log(`${status} ${(p.product_name || 'No name').substring(0, 50).padEnd(52)} → ${sid || 'NO ID'}`);
      if (!exists) orphaned++;
    });
    
    console.log('='.repeat(80));
    console.log(`\n📋 Summary:`);
    console.log(`  - Shopify backend: ${shopifyProducts.length} products`);
    console.log(`  - PriceElephant DB: ${peProducts.length} products`);
    console.log(`  - Orphaned (in DB but not Shopify): ${orphaned} products`);
    
    if (orphaned > 0) {
      console.log(`\n⚠️  ${orphaned} products need to be cleaned up!`);
      console.log(`   Run: node scripts/cleanup-orphaned-products.js ${customerId}`);
    }
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    if (err.response) {
      console.error('Response:', err.response.data);
    }
    process.exit(1);
  }
})();
