/**
 * Seed customer configs
 * Sets up sitemap configuration for initial customer
 */

exports.seed = async function(knex) {
  // Insert Enterprise customer config (example: Hobo)
  await knex('customer_configs').insert([
    {
      customer_id: '8557353828568',
      sitemap_url: 'https://www.hobo.nl/sitemap/sitemap.xml',
      sitemap_max_products: 10000, // Enterprise unlimited
      company_name: 'Hobo.nl',
      shopify_domain: process.env.SHOPIFY_SHOP_DOMAIN || 'hobo-test.myshopify.com',
      shopify_access_token: process.env.SHOPIFY_ACCESS_TOKEN
    }
  ]).onConflict('customer_id').merge();
  
  console.log('✅ Customer configs seeded');
};
