/**
 * Add variant support to products table
 * Allows products to be grouped as variants of a parent product
 */

exports.up = function(knex) {
  return knex.schema
    // Add variant columns to products table
    .table('products', function(table) {
      table.bigInteger('parent_product_id').nullable();
      table.string('variant_title', 200).nullable(); // e.g. "Rood / Large", "500ml"
      table.integer('variant_position').defaultTo(1); // Display order
      table.string('option1_name', 100).nullable(); // e.g. "Kleur", "Maat"
      table.string('option1_value', 100).nullable(); // e.g. "Rood", "Large"
      table.string('option2_name', 100).nullable(); // e.g. "Maat"
      table.string('option2_value', 100).nullable(); // e.g. "500ml"
      table.string('option3_name', 100).nullable();
      table.string('option3_value', 100).nullable();
      table.boolean('is_parent_product').defaultTo(true); // True if this is the main product
      
      // Add foreign key constraint
      table.foreign('parent_product_id').references('id').inTable('products').onDelete('CASCADE');
      
      // Add indexes for performance
      table.index('parent_product_id');
      table.index(['shopify_customer_id', 'is_parent_product']);
    });
};

exports.down = function(knex) {
  return knex.schema.table('products', function(table) {
    table.dropForeign('parent_product_id');
    table.dropColumn('parent_product_id');
    table.dropColumn('variant_title');
    table.dropColumn('variant_position');
    table.dropColumn('option1_name');
    table.dropColumn('option1_value');
    table.dropColumn('option2_name');
    table.dropColumn('option2_value');
    table.dropColumn('option3_name');
    table.dropColumn('option3_value');
    table.dropColumn('is_parent_product');
  });
};
