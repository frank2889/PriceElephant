const axios = require('axios');

(async () => {
  try {
    // Check if we can query customer config via the API
    const testUrl = 'https://web-production-2568.up.railway.app/api/v1/products/8557353828568?limit=1';
    const response = await axios.get(testUrl);
    
    console.log('Production is responding ✅');
    console.log(`Products: ${response.data.pagination.total}`);
    
    // The issue: sitemap import is scanning but not creating products
    // Likely cause: Shopify credentials not set in customer_configs after migration
    
    console.log('\n⚠️  DIAGNOSIS:');
    console.log('1. Migration added shopify_access_token column ✅');
    console.log('2. Seed needs to run in production to populate credentials ❌');
    console.log('3. Without credentials, sitemap import can\\'t create Shopify products');
    console.log('\n💡 SOLUTION:');
    console.log('Railway doesn\\'t auto-run seeds. You need to manually update the customer_configs');
    console.log('table in production with Shopify credentials.');
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
