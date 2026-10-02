const pool = require('../config/db');
const AppError = require('../utils/AppError');

async function createCentre({ name, location }) {
  const result = await pool.query(
    'INSERT INTO diagnostic_centres (name, location) VALUES ($1, $2) RETURNING id, name, location, created_at',
    [name.trim(), location.trim()]
  );
  return result.rows[0];
}

async function listCentres() {
  const result = await pool.query('SELECT id, name, location, created_at FROM diagnostic_centres ORDER BY id');
  return result.rows;
}

async function getCentre(id) {
  const result = await pool.query('SELECT id, name, location, created_at FROM diagnostic_centres WHERE id = $1', [id]);
  if (!result.rowCount) throw new AppError('Diagnostic centre not found', 404);
  return result.rows[0];
}

async function createTest({ name, description = '' }) {
  try {
    const result = await pool.query(
      'INSERT INTO diagnostic_tests (name, description) VALUES ($1, $2) RETURNING id, name, description, created_at',
      [name.trim(), description.trim()]
    );
    return result.rows[0];
  } catch (error) {
    if (error.code === '23505') throw new AppError('A diagnostic test with this name already exists', 409);
    throw error;
  }
}

async function listTests() {
  const result = await pool.query('SELECT id, name, description, created_at FROM diagnostic_tests ORDER BY id');
  return result.rows;
}

async function associateTest(centreId, { test_id: testId, price }) {
  const centre = await pool.query('SELECT id FROM diagnostic_centres WHERE id = $1', [centreId]);
  if (!centre.rowCount) throw new AppError('Diagnostic centre not found', 404);
  const test = await pool.query('SELECT id FROM diagnostic_tests WHERE id = $1', [testId]);
  if (!test.rowCount) throw new AppError('Diagnostic test not found', 404);

  try {
    const result = await pool.query(
      `INSERT INTO centre_tests (centre_id, test_id, price)
       VALUES ($1, $2, $3)
       RETURNING id, centre_id, test_id, price`,
      [centreId, testId, price]
    );
    return result.rows[0];
  } catch (error) {
    if (error.code === '23505') throw new AppError('This test is already offered by the centre', 409);
    throw error;
  }
}

async function listCentreTests(centreId) {
  const result = await pool.query(
    `SELECT ct.id AS centre_test_id, ct.price, t.id AS test_id, t.name, t.description
     FROM diagnostic_centres c
     LEFT JOIN centre_tests ct ON ct.centre_id = c.id
     LEFT JOIN diagnostic_tests t ON t.id = ct.test_id
     WHERE c.id = $1 ORDER BY t.name`,
    [centreId]
  );
  if (!result.rowCount) throw new AppError('Diagnostic centre not found', 404);
  return result.rows.filter((row) => row.test_id !== null);
}

module.exports = { createCentre, listCentres, getCentre, createTest, listTests, associateTest, listCentreTests };