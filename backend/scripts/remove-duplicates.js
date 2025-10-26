/**
 * Remove duplicate products based on EAN
 * Keeps the oldest product (lowest ID) per EAN
 */

require('dotenv').config();
const db = require('../config/database');

async function removeDuplicates(customerId) {
  console.log('\n🔍 Finding duplicate products...\n');

  try {
    // Find products with duplicate EANs
    const duplicates = await db('products')
      .select('product_ean')
      .where({
        shopify_customer_id: customerId,
        active: true
      })
      .whereNotNull('product_ean')
      .groupBy('product_ean')
      .havingRaw('COUNT(*) > 1');

    if (duplicates.length === 0) {
      console.log('✅ No duplicates found!');
      return { removed: 0 };
    }

    console.log(`Found ${duplicates.length} EANs with duplicates:\n`);

    let totalRemoved = 0;

    for (const { product_ean } of duplicates) {
      // Get all products with this EAN
      const products = await db('products')
        .where({
          shopify_customer_id: customerId,
          product_ean: product_ean,
          active: true
        })
        .orderBy('id', 'asc');

      console.log(`📦 EAN ${product_ean}: ${products.length} duplicates`);
      products.forEach((p, i) => {
        console.log(`   ${i === 0 ? '✅ KEEP' : '❌ DELETE'} - ID ${p.id}: ${p.product_name}`);
      });

      // Keep first (oldest), delete rest
      const toDelete = products.slice(1).map(p => p.id);

      if (toDelete.length > 0) {
        const deleted = await db('products')
          .whereIn('id', toDelete)
          .update({ active: false, updated_at: db.fn.now() });

        totalRemoved += deleted;
        console.log(`   ⚠️  Soft-deleted ${deleted} products\n`);
      }
    }

    console.log(`\n📊 CLEANUP RESULTS:`);
    console.log(`   Total duplicates removed: ${totalRemoved}`);
    console.log(`   Unique products retained: ${duplicates.length}`);

    return { removed: totalRemoved };

  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    throw error;
  } finally {
    await db.destroy();
  }
}

// Run cleanup
const customerId = process.argv[2] || '8557353828568';
console.log(`🧹 Cleaning up duplicates for customer ${customerId}...`);

removeDuplicates(customerId)
  .then(result => {
    console.log('\n✅ Cleanup complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Cleanup failed:', error);
    process.exit(1);
  });
