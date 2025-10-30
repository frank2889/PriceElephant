/**
 * Migration: Ensure products.import_source exists
 */

exports.up = async function (knex) {
  const exists = await knex.schema.hasColumn('products', 'import_source');
  if (!exists) {
    await knex.schema.alterTable('products', (table) => {
      table.string('import_source', 100).nullable();
    });
  }
};

exports.down = async function (knex) {
  const exists = await knex.schema.hasColumn('products', 'import_source');
  if (exists) {
    await knex.schema.alterTable('products', (table) => {
      table.dropColumn('import_source');
    });
  }
};
