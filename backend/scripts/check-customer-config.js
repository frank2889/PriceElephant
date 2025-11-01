const axios = require('axios');

const customerId = '8557353828568';

(async () => {
  try {
    // Check if customer config API exists
    const configUrl = `https://web-production-2568.up.railway.app/api/v1/customer-config/${customerId}`;
    
    try {
      const response = await axios.get(configUrl);
      console.log('Customer config:', JSON.stringify(response.data, null, 2));
    } catch (apiErr) {
      console.log('No customer config API, checking via admin...');
      
      // Try getting products to see customer info
      const productsResponse = await axios.get(`https://web-production-2568.up.railway.app/api/v1/products/${customerId}`);
      console.log(`Products exist: ${productsResponse.data.pagination.total}`);
      console.log('\n❌ Customer config API not available');
      console.log('This customer likely has products but incomplete Shopify setup');
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  }
  
  process.exit(0);
})();
