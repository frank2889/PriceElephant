/**
 * Migration: Ensure products.in_stock exists
 */

exports.up = async function (knex) {
  const exists = await knex.schema.hasColumn('products', 'in_stock');
  if (!exists) {
    await knex.schema.alterTable('products', (table) => {
      table.boolean('in_stock').defaultTo(true);
    });
  }
};

exports.down = async function (knex) {
  const exists = await knex.schema.hasColumn('products', 'in_stock');
  if (exists) {
    await knex.schema.alterTable('products', (table) => {
      table.dropColumn('in_stock');
    });
  }
};
