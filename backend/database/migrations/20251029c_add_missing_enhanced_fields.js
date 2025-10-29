exports.up = async function (knex) {
  const columnChecks = [
    { name: 'brand', type: (table) => table.string('brand', 100).nullable() },
    { name: 'rating', type: (table) => table.decimal('rating', 3, 2).nullable() },
    { name: 'review_count', type: (table) => table.integer('review_count').nullable() },
    { name: 'stock_level', type: (table) => table.integer('stock_level').nullable() },
    { name: 'delivery_time', type: (table) => table.string('delivery_time', 255).nullable() }
  ];

  for (const column of columnChecks) {
    const exists = await knex.schema.hasColumn('products', column.name);
    if (!exists) {
      await knex.schema.alterTable('products', (table) => {
        column.type(table);
      });
    }
  }
};

exports.down = async function (knex) {
  const columns = ['brand', 'rating', 'review_count', 'stock_level', 'delivery_time'];

  for (const column of columns) {
    const exists = await knex.schema.hasColumn('products', column);
    if (exists) {
      await knex.schema.alterTable('products', (table) => {
        table.dropColumn(column);
      });
    }
  }
};
