/**
 * Populate Shopify credentials for existing customer
 * This runs automatically on Railway (unlike seeds)
 */

exports.up = async function(knex) {
  // Update Hobo customer with Shopify credentials from environment
  const shopifyDomain = process.env.SHOPIFY_SHOP_DOMAIN;
  const shopifyToken = process.env.SHOPIFY_ACCESS_TOKEN;
  
  if (!shopifyDomain || !shopifyToken) {
    console.log('⚠️  SHOPIFY_SHOP_DOMAIN or SHOPIFY_ACCESS_TOKEN not set - skipping credential update');
    return;
  }
  
  const updated = await knex('customer_configs')
    .where({ customer_id: '8557353828568' })
    .update({
      shopify_domain: shopifyDomain,
      shopify_access_token: shopifyToken,
      updated_at: knex.fn.now()
    });
  
  if (updated > 0) {
    console.log(`✅ Updated customer 8557353828568 with Shopify credentials (${shopifyDomain})`);
  } else {
    console.log('⚠️  Customer 8557353828568 not found in customer_configs');
  }
};

exports.down = async function(knex) {
  // Clear Shopify credentials on rollback
  await knex('customer_configs')
    .where({ customer_id: '8557353828568' })
    .update({
      shopify_domain: null,
      shopify_access_token: null,
      updated_at: knex.fn.now()
    });
};
