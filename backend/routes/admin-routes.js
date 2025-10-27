/**
 * Database Migration API Endpoint
 * Run migrations remotely on production
 */

const express = require('express');
const db = require('../config/database');

const router = express.Router();

/**
 * GET /api/v1/admin/migrate
 * Run pending migrations
 * Protected by admin token
 */
router.get('/migrate', async (req, res) => {
  try {
    // Simple admin token check
    const adminToken = req.headers['x-admin-token'];
    if (!adminToken || adminToken !== process.env.ADMIN_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Run migrations
    const [batch, migrations] = await db.migrate.latest();
    
    res.json({
      success: true,
      batch,
      migrations,
      message: migrations.length > 0 
        ? `Ran ${migrations.length} migration(s)` 
        : 'Database is up to date'
    });

  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({
      error: 'Migration failed',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/admin/migrate/status
 * Check migration status
 */
router.get('/migrate/status', async (req, res) => {
  try {
    const adminToken = req.headers['x-admin-token'];
    if (!adminToken || adminToken !== process.env.ADMIN_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const [completed, pending] = await Promise.all([
      db.migrate.list(),
      db.migrate.list()
    ]);

    res.json({
      success: true,
      completed: completed[0],
      pending: completed[1]
    });

  } catch (error) {
    console.error('Migration status error:', error);
    res.status(500).json({
      error: 'Failed to check migration status',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/admin/db/schema
 * Get current database schema for products table
 */
router.get('/db/schema', async (req, res) => {
  try {
    const adminToken = req.headers['x-admin-token'];
    if (!adminToken || adminToken !== process.env.ADMIN_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const columns = await db('products').columnInfo();
    
    res.json({
      success: true,
      table: 'products',
      columns: Object.keys(columns).map(name => ({
        name,
        type: columns[name].type,
        nullable: columns[name].nullable,
        defaultValue: columns[name].defaultValue
      }))
    });

  } catch (error) {
    console.error('Schema error:', error);
    res.status(500).json({
      error: 'Failed to get schema',
      message: error.message
    });
  }
});

module.exports = router;
