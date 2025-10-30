/**
 * Migration: Add learned_selectors table
 * Purpose: Store successful CSS selectors per domain for self-learning scraper
 * Date: October 30, 2025
 */

exports.up = function(knex) {
  return knex.schema.createTable('learned_selectors', function(table) {
    table.increments('id').primary();
    
    // Domain identification
    table.string('domain', 255).notNullable().index(); // e.g., "hifi.eu"
    table.string('field_name', 50).notNullable(); // e.g., "price", "title", "stock"
    
    // Selector details
    table.text('css_selector').notNullable(); // The actual CSS selector that worked
    table.string('selector_type', 50).default('css'); // css, xpath, etc.
    
    // Learning metrics
    table.integer('success_count').defaultTo(1); // How many times this selector worked
    table.integer('failure_count').defaultTo(0); // How many times it failed
    table.decimal('success_rate', 5, 2).defaultTo(100.00); // Percentage (0-100)
    table.integer('priority').defaultTo(0); // Higher = try first (based on success rate)
    
    // Source tracking
    table.string('learned_from', 50).defaultTo('css'); // 'css', 'ai_vision', 'manual'
    table.text('example_value'); // Example of what was extracted (for validation)
    
    // Metadata
    table.timestamp('first_seen').defaultTo(knex.fn.now());
    table.timestamp('last_used').defaultTo(knex.fn.now());
    table.timestamp('last_success').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Indexes for fast lookup
    table.index(['domain', 'field_name']); // Primary lookup
    table.index(['domain', 'field_name', 'success_rate']); // For sorted retrieval
    table.unique(['domain', 'field_name', 'css_selector']); // No duplicates
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('learned_selectors');
};
