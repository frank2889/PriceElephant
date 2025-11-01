/**
 * Migration: Create sitemap_import_status table
 * Tracks background sitemap import progress and status
 */

exports.up = async function(knex) {
  await knex.schema.createTable('sitemap_import_status', (table) => {
    table.bigInteger('customer_id').primary();
    table.string('status', 20).notNullable().defaultTo('idle'); // idle, running, completed, failed
    table.integer('progress').defaultTo(0); // 0-100
    table.integer('scanned').defaultTo(0);
    table.integer('detected').defaultTo(0);
    table.integer('created').defaultTo(0);
    table.integer('updated').defaultTo(0);
    table.integer('skipped').defaultTo(0);
    table.integer('errors').defaultTo(0);
    table.text('current_url');
    table.text('message');
    table.text('error_message');
    table.timestamp('started_at');
    table.timestamp('completed_at');
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    table.index('status');
  });

  console.log('✅ Created sitemap_import_status table');
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('sitemap_import_status');
  console.log('✅ Dropped sitemap_import_status table');
};
