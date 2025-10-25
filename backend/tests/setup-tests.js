process.env.NODE_ENV = 'test';

if (!process.env.TEST_DATABASE_URL) {
  const user = process.env.TEST_DATABASE_USER || process.env.PGUSER || process.env.USER || 'postgres';
  const host = process.env.TEST_DATABASE_HOST || 'localhost';
  const port = process.env.TEST_DATABASE_PORT || '5432';
  const name = process.env.TEST_DATABASE_NAME || 'priceelephant_test';
  process.env.TEST_DATABASE_URL = `postgres://${user}@${host}:${port}/${name}`;
}

const db = require('../config/database');

beforeAll(async () => {
  await db.migrate.latest();
  await db.raw('TRUNCATE TABLE subscriptions RESTART IDENTITY CASCADE');
  await db.seed.run();
});

afterAll(async () => {
  await db.destroy();
});
