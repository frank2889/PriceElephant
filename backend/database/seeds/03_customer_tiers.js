/**
 * Seed customer tiers
 * Sets up Enterprise tier for initial customer
 */

exports.seed = async function(knex) {
  // Insert Enterprise customer (example: Hobo)
  await knex('customer_tiers').insert([
    {
      customer_id: '8557353828568',
      tier: 'enterprise',
      product_limit: 0, // unlimited
      competitor_limit: 0, // unlimited
      api_access: true,
      monthly_price: 249.00
    }
  ]).onConflict('customer_id').merge();
  
  console.log('✅ Customer tiers seeded');
};
