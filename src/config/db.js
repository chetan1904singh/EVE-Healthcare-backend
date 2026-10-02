const { Pool } = require('pg');

const connectionString = process.env.NODE_ENV === 'test'
  ? process.env.TEST_DATABASE_URL
  : process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(process.env.NODE_ENV === 'test'
    ? 'TEST_DATABASE_URL is required when running tests'
    : 'DATABASE_URL is required');
}

const pool = new Pool({
  connectionString,
  options: process.env.NODE_ENV === 'test' ? '-c search_path=eve_healthcare_test' : undefined
});

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error.message);
});

module.exports = pool;