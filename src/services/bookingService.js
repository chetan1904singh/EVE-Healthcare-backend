const pool = require('../config/db');
const AppError = require('../utils/AppError');

async function createBooking(userId, { centre_test_id: centreTestId, appointment_time: appointmentTime }) {
  const result = await pool.query(
    `INSERT INTO bookings (user_id, centre_test_id, appointment_time, amount)
     SELECT $1, ct.id, $3, ct.price
     FROM centre_tests ct WHERE ct.id = $2
     RETURNING id, user_id, centre_test_id, appointment_time, amount, status, created_at`,
    [userId, centreTestId, appointmentTime]
  );
  if (!result.rowCount) throw new AppError('Centre test offering not found', 404);
  return result.rows[0];
}

async function listBookings(userId) {
  const result = await pool.query(
    'SELECT id, user_id, centre_test_id, appointment_time, amount, status, created_at FROM bookings WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return result.rows;
}

async function getBooking(userId, id) {
  const result = await pool.query(
    'SELECT id, user_id, centre_test_id, appointment_time, amount, status, created_at FROM bookings WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  if (!result.rowCount) throw new AppError('Booking not found', 404);
  return result.rows[0];
}

async function cancelBooking(userId, id) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const booking = await client.query('SELECT id, status FROM bookings WHERE id = $1 AND user_id = $2 FOR UPDATE', [id, userId]);
    if (!booking.rowCount) throw new AppError('Booking not found', 404);
    if (booking.rows[0].status !== 'PENDING') {
      throw new AppError(`A ${booking.rows[0].status.toLowerCase()} booking cannot be cancelled`, 409);
    }
    const result = await client.query(
      `UPDATE bookings SET status = 'CANCELLED'
       WHERE id = $1 RETURNING id, user_id, centre_test_id, appointment_time, amount, status, created_at`,
      [id]
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { createBooking, listBookings, getBooking, cancelBooking };