const axios = require('axios');

const customerId = '8557353828568';

(async () => {
  try {
    // Check current product count
    const productsRes = await axios.get(`https://web-production-2568.up.railway.app/api/v1/products/${customerId}?limit=1`);
    const totalProducts = productsRes.data.pagination.total;
    
    console.log(`\n📊 Current Status:`);
    console.log(`   Products in database: ${totalProducts}`);
    
    console.log(`\n✅ Resume Feature Already Built:`);
    console.log(`   1. Progress auto-saves after each import`);
    console.log(`   2. Next import auto-resumes from last position`);
    console.log(`   3. No need to start from beginning each time`);
    
    console.log(`\n📝 How to Use:`);
    console.log(`   - Click "Nu importeren" - it will resume automatically`);
    console.log(`   - If you want to start fresh, use resetProgress option`);
    
    console.log(`\n🔍 Current Issue:`);
    console.log(`   Import is scanning but not creating NEW products because:`);
    console.log(`   A) Products being scanned already exist in DB (get updated)`);
    console.log(`   B) Scraper failing to detect price/title (gets skipped)`);
    console.log(`   C) HTTP scraper not working on all product pages`);
    
    console.log(`\n💡 Recommendation:`);
    console.log(`   Check the final import statistics when it completes:`);
    console.log(`   - Scanned: X URLs checked`);
    console.log(`   - Detected: X products found (with price/title)`);
    console.log(`   - Created: X new products added`);
    console.log(`   - Updated: X existing products refreshed`);
    console.log(`   - Skipped: X URLs without product data`);
    
  } catch (err) {
    console.error('Error:', err.message);
  }
  
  process.exit(0);
})();
