const db = require('../config/database');
const axios = require('axios');

const customerId = '8557353828568';

(async () => {
  try {
    // Get customer config
    const customer = await db('customer_configs')
      .where({ customer_id: customerId })
      .first();
    
    if (!customer) {
      console.log('❌ Customer not found');
      process.exit(1);
    }
    
    console.log('👤 Customer ID:', customerId);
    console.log('🏪 Shop:', customer.shopify_domain);
    
    // Check database products linked to this customer
    const productCustomers = await db('product_customers')
      .where('shopify_customer_id', customerId);
    
    const dbProducts = await db('products')
      .where('shopify_customer_id', customerId);
    
    console.log('\n📊 Database products (via product_customers):', productCustomers.length);
    console.log('📊 Database products (via shopify_customer_id):', dbProducts.length);
    
    // Check sitemap config
    const sitemapConfig = await db('sitemap_configs')
      .where({ customer_id: customerId })
      .first();
    
    console.log('\n🗺️ Sitemap config:', sitemapConfig ? {
      url: sitemapConfig.sitemap_url,
      last_scraped_page: sitemapConfig.last_scraped_page,
      total_pages_scraped: sitemapConfig.total_pages_scraped,
      last_import_at: sitemapConfig.last_import_at
    } : 'None');
    
    // Check Shopify products
    const shopifyUrl = `https://${customer.shopify_domain}/admin/api/2024-01/products.json`;
    const shopifyResponse = await axios.get(shopifyUrl, {
      headers: {
        'X-Shopify-Access-Token': customer.shopify_access_token
      }
    });
    
    console.log('\n🛍️ Shopify products:', shopifyResponse.data.products.length);
    shopifyResponse.data.products.forEach((p, i) => {
      console.log(`  ${i+1}. ${p.title} - ID: ${p.id}`);
    });
    
    if (productCustomers.length > 0) {
      console.log('\n📦 Products linked via product_customers:');
      const linkedProducts = await db('products')
        .whereIn('id', productCustomers.map(pc => pc.product_id));
      linkedProducts.forEach((p, i) => {
        console.log(`  ${i+1}. ${p.product_name} - Shopify PID: ${p.shopify_product_id}`);
      });
    }
    
    if (dbProducts.length > 0) {
      console.log('\n📦 Products in database:');
      dbProducts.forEach((p, i) => {
        console.log(`  ${i+1}. ${p.product_name} - Shopify PID: ${p.shopify_product_id}`);
      });
    }
    
    // Summary
    console.log('\n📋 Summary:');
    console.log(`  - Shopify backend: ${shopifyResponse.data.products.length} products`);
    console.log(`  - PriceElephant DB (product_customers): ${productCustomers.length} products`);
    console.log(`  - PriceElephant DB (shopify_customer_id): ${dbProducts.length} products`);
    console.log(`  - Dashboard shows: 11 products (user report)`);
    console.log(`  - Client collection: 0 products (user report)`);
    
    console.log('\n🔍 Analysis:');
    if (shopifyResponse.data.products.length === 3 && productCustomers.length === 0) {
      console.log('  ❌ PROBLEM: Products exist in Shopify but not in PriceElephant database');
      console.log('  💡 This means the sitemap import or manual import did not save to database');
      console.log('  🔧 Check: import logs, database errors, or run cleanup script');
    }
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
