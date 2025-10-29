exports.up = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('products', 'bundle_info');
  if (!hasColumn) {
    await knex.schema.alterTable('products', (table) => {
      table.text('bundle_info').nullable();
    });
  }
};

exports.down = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('products', 'bundle_info');
  if (hasColumn) {
    await knex.schema.alterTable('products', (table) => {
      table.dropColumn('bundle_info');
    });
  }
};
