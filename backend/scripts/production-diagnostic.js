/**
 * Production diagnostic - check database state
 * Run this on Railway to see actual production data
 */

const db = require('../config/database');

async function diagnoseProd() {
  try {
    console.log('=== PRODUCTION DIAGNOSTIC ===\n');
    
    // 1. Check total products
    const totalResult = await db('products').count('* as count');
    console.log('1️⃣  Total products:', totalResult[0].count);
    
    // 2. Products by customer
    const byCustomer = await db('products')
      .select('shopify_customer_id')
      .groupBy('shopify_customer_id')
      .count('* as count');
    
    console.log('\n2️⃣  Products by customer:');
    byCustomer.forEach(row => {
      console.log(`   Customer ${row.shopify_customer_id}: ${row.count} products`);
    });
    
    // 3. Customer configs
    const configs = await db('customer_configs')
      .select('customer_id', 'company_name', 'shopify_domain', 'shopify_access_token', 'sitemap_url');
    
    console.log('\n3️⃣  Customer configs:');
    configs.forEach(c => {
      console.log(`   ${c.customer_id} (${c.company_name || 'No name'})`);
      console.log(`      Domain: ${c.shopify_domain || 'NOT SET'}`);
      console.log(`      Token: ${c.shopify_access_token ? 'SET' : 'MISSING'}`);
      console.log(`      Sitemap: ${c.sitemap_url || 'NOT SET'}`);
    });
    
    // 4. Recent products
    const recent = await db('products')
      .select('id', 'product_name', 'shopify_customer_id', 'shopify_product_id', 'created_at')
      .orderBy('created_at', 'desc')
      .limit(10);
    
    console.log(`\n4️⃣  Recent 10 products:`);
    recent.forEach(p => {
      const syncStatus = p.shopify_product_id ? '✅' : '❌';
      console.log(`   ${syncStatus} [${p.shopify_customer_id}] ${p.product_name.substring(0, 40)}`);
    });
    
    // 5. Sitemap configs
    const sitemapConfigs = await db('sitemap_configs')
      .select('*');
    
    console.log(`\n5️⃣  Sitemap progress tracking:`);
    if (sitemapConfigs.length === 0) {
      console.log('   No sitemap tracking data');
    } else {
      sitemapConfigs.forEach(sc => {
        console.log(`   Customer ${sc.customer_id}: Page ${sc.last_scraped_page || 0}`);
      });
    }
    
    console.log('\n=== END DIAGNOSTIC ===');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message, error.stack);
    process.exit(1);
  }
}

diagnoseProd();
