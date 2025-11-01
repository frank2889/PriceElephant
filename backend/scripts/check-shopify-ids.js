const axios = require('axios');

const customerId = '8557353828568';
const apiUrl = 'https://web-production-2568.up.railway.app';

(async () => {
  try {
    const response = await axios.get(`${apiUrl}/api/v1/products/${customerId}?limit=100`);
    const products = response.data.products;
    
    console.log(`\nTotal products in DB: ${response.data.pagination.total}\n`);
    console.log('Shopify Product IDs:');
    console.log('='.repeat(80));
    
    let withShopifyId = 0;
    let withoutShopifyId = 0;
    
    products.forEach((p, i) => {
      const sid = p.shopify_product_id;
      const name = (p.product_name || 'No name').substring(0, 50);
      
      if (sid) {
        console.log(`✅ ${name.padEnd(52)} → Shopify ID: ${sid}`);
        withShopifyId++;
      } else {
        console.log(`❌ ${name.padEnd(52)} → NO SHOPIFY ID`);
        withoutShopifyId++;
      }
    });
    
    console.log('='.repeat(80));
    console.log(`\nSummary:`);
    console.log(`  ✅ With Shopify ID: ${withShopifyId}`);
    console.log(`  ❌ Without Shopify ID: ${withoutShopifyId}`);
    console.log(`  📊 Total: ${products.length}`);
    
    if (withoutShopifyId > 0) {
      console.log(`\n⚠️  WARNING: ${withoutShopifyId} products exist in PriceElephant DB but NOT in Shopify!`);
      console.log(`   This means they were created in DB but Shopify sync failed.`);
    }
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
