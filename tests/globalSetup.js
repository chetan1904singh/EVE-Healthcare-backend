require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

module.exports = async function setupTestSchema() {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    throw new Error('Set TEST_DATABASE_URL to a reachable, disposable PostgreSQL test database');
  }

  const client = new Client({
    connectionString
  });

  try {
    await client.connect();
    await client.query('CREATE SCHEMA IF NOT EXISTS eve_healthcare_test');
    await client.query('SET search_path TO eve_healthcare_test');
    const schema = fs.readFileSync(path.join(__dirname, '..', 'src', 'schema.sql'), 'utf8');
    await client.query(schema);
  } catch (error) {
    throw new Error(`Could not initialize the PostgreSQL test schema: ${error.message}`);
  } finally {
    await client.end();
  }
};