const { randomUUID } = require('crypto');
const pool = require('../config/db');
const AppError = require('../utils/AppError');

function simulatedStatus() {
  const successRate = Number(process.env.PAYMENT_SUCCESS_RATE ?? 0.8);
  return Math.random() < successRate ? 'SUCCESS' : 'FAILED';
}

async function processPayment(userId, bookingId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const bookingResult = await client.query(
      'SELECT id, user_id, amount, status FROM bookings WHERE id = $1 FOR UPDATE',
      [bookingId]
    );
    if (!bookingResult.rowCount) throw new AppError('Booking not found', 404);
    const booking = bookingResult.rows[0];
    if (String(booking.user_id) !== String(userId)) throw new AppError('You cannot pay for this booking', 403);
    if (booking.status !== 'PENDING') throw new AppError('Only pending bookings can be paid', 409);

    const status = simulatedStatus();
    const providerPaymentId = `pay_${randomUUID()}`;
    const paymentResult = await client.query(
      `INSERT INTO payments (booking_id, provider_payment_id, amount, status)
       VALUES ($1, $2, $3, $4)
       RETURNING id, booking_id, provider_payment_id, amount, status, created_at`,
      [bookingId, providerPaymentId, booking.amount, status]
    );
    const updatedBooking = await client.query(
      'UPDATE bookings SET status = $2 WHERE id = $1 RETURNING id, status',
      [bookingId, status === 'SUCCESS' ? 'CONFIRMED' : 'FAILED']
    );
    await client.query('COMMIT');
    return { payment: paymentResult.rows[0], booking: updatedBooking.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function processWebhook({ event_id: eventId, event_type: eventType, payment_id: paymentId, booking_id: bookingId, status }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const event = await client.query(
      `INSERT INTO webhook_events (event_id, event_type) VALUES ($1, $2)
       ON CONFLICT (event_id) DO NOTHING RETURNING id`,
      [eventId, eventType]
    );

    if (!event.rowCount) {
      await client.query('COMMIT');
      return { duplicate: true };
    }

    const bookingResult = await client.query('SELECT id, status FROM bookings WHERE id = $1 FOR UPDATE', [bookingId]);
    if (!bookingResult.rowCount) throw new AppError('Booking not found', 404);

    const paymentResult = await client.query(
      'SELECT id, booking_id, status FROM payments WHERE provider_payment_id = $1 AND booking_id = $2 FOR UPDATE',
      [paymentId, bookingId]
    );
    if (!paymentResult.rowCount) throw new AppError('Payment not found for this booking', 404);

    const booking = bookingResult.rows[0];
    const payment = paymentResult.rows[0];
    const expectedBookingStatus = status === 'SUCCESS' ? 'CONFIRMED' : 'FAILED';

    if (payment.status !== status) {
      if (booking.status !== 'PENDING') {
        throw new AppError('Payment result conflicts with the booking state', 409);
      }
      await client.query('UPDATE payments SET status = $1 WHERE id = $2', [status, payment.id]);
      await client.query('UPDATE bookings SET status = $1 WHERE id = $2', [expectedBookingStatus, bookingId]);
    } else if (booking.status !== expectedBookingStatus) {
      if (booking.status !== 'PENDING') throw new AppError('Payment result conflicts with the booking state', 409);
      await client.query('UPDATE bookings SET status = $1 WHERE id = $2', [expectedBookingStatus, bookingId]);
    }

    await client.query('COMMIT');
    return { duplicate: false, booking_id: bookingId, payment_id: paymentId, status };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { processPayment, processWebhook };