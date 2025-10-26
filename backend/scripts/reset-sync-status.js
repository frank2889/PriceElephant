/**
 * Reset Shopify sync status for products
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const knex = require('knex');
const knexConfig = require('../knexfile');

const db = knex(knexConfig[process.env.NODE_ENV || 'development']);

async function resetSync(customerId) {
  try {
    const count = await db('products')
      .where({ shopify_customer_id: customerId })
      .update({ 
        shopify_product_id: null,
        updated_at: db.fn.now()
      });

    console.log(`✅ Reset ${count} products for customer ${customerId}`);
    return count;
  } catch (error) {
    console.error('❌ Reset failed:', error.message);
    throw error;
  } finally {
    await db.destroy();
  }
}

const customerId = process.argv[2] || '8557353828568';
resetSync(customerId)
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
