module.exports = {
  development: {
    client: 'postgresql',
    connection: process.env.DATABASE_URL || {
      host: 'localhost',
      port: 5432,
      database: 'priceelephant_dev',
      user: 'Frank'
    },
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      directory: './database/migrations',
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: './database/seeds'
    }
  },

  production: {
    client: 'postgresql',
    connection: process.env.DATABASE_URL,
    pool: {
      min: parseInt(process.env.DATABASE_POOL_MIN) || 5,
      max: parseInt(process.env.DATABASE_POOL_MAX) || 20
    },
    migrations: {
      directory: './database/migrations',
      tableName: 'knex_migrations'
    },
    ssl: {
      rejectUnauthorized: false
    }
  }
};
