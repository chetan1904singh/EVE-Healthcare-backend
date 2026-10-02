process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'jest-only-secret-for-api-tests';
process.env.WEBHOOK_SECRET = 'jest-only-webhook-secret';
process.env.PAYMENT_SUCCESS_RATE = '1';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const pool = require('../src/config/db');

let firstUser;
let secondUser;

async function createAccount(name, email) {
  await request(app).post('/auth/signup').send({ name, email, password: 'Strongpass123' }).expect(201);
  const response = await request(app).post('/auth/login').send({ email, password: 'Strongpass123' }).expect(200);
  return { token: response.body.data.token, user: response.body.data.user };
}

async function createOffering(token) {
  const centre = await request(app).post('/centres').set('Authorization', `Bearer ${token}`)
    .send({ name: 'Central Diagnostics', location: 'Pune' }).expect(201);
  const test = await request(app).post('/tests').set('Authorization', `Bearer ${token}`)
    .send({ name: 'Complete Blood Count', description: 'Blood panel' }).expect(201);
  const offering = await request(app).post(`/centres/${centre.body.data.id}/tests`)
    .set('Authorization', `Bearer ${token}`).send({ test_id: test.body.data.id, price: 850 }).expect(201);
  return { centre: centre.body.data, test: test.body.data, offering: offering.body.data };
}

async function createBooking(token, centreTestId) {
  return request(app).post('/bookings').set('Authorization', `Bearer ${token}`)
    .send({ centre_test_id: centreTestId, appointment_time: new Date(Date.now() + 86400000).toISOString() })
    .expect(201);
}

beforeEach(async () => {
  await pool.query('TRUNCATE webhook_events, payments, bookings, centre_tests, diagnostic_tests, diagnostic_centres, users RESTART IDENTITY CASCADE');
  firstUser = await createAccount('Avery Patient', 'avery@example.com');
  secondUser = await createAccount('Jordan Patient', 'jordan@example.com');
});

afterAll(async () => {
  await pool.end();
});

describe('authentication', () => {
  test('signs up and never returns a password hash', async () => {
    const response = await request(app).post('/auth/signup')
      .send({ name: 'Taylor Patient', email: 'taylor@example.com', password: 'Strongpass123' })
      .expect(201);
    expect(response.body.data.user.email).toBe('taylor@example.com');
    expect(response.body.data.user.password_hash).toBeUndefined();
  });

  test('rejects duplicate signup', async () => {
    await request(app).post('/auth/signup')
      .send({ name: 'Another Avery', email: 'avery@example.com', password: 'Strongpass123' })
      .expect(409);
  });

  test('logs in and rejects an incorrect password', async () => {
    const response = await request(app).post('/auth/login')
      .send({ email: 'avery@example.com', password: 'Strongpass123' }).expect(200);
    expect(response.body.data.token).toBeTruthy();
    await request(app).post('/auth/login')
      .send({ email: 'avery@example.com', password: 'Wrongpass123' }).expect(401);
  });

  test.each([undefined, 'Bearer invalid.token.value'])('rejects missing or invalid JWT (%s)', async (authorization) => {
    const call = request(app).get('/bookings');
    if (authorization) call.set('Authorization', authorization);
    await call.expect(401);
  });

  test('rejects expired JWTs', async () => {
    const expiredToken = jwt.sign({ id: firstUser.user.id }, process.env.JWT_SECRET, { expiresIn: '-1s' });
    await request(app).get('/bookings').set('Authorization', `Bearer ${expiredToken}`).expect(401);
  });

  test('rejects malformed signup input', async () => {
    await request(app).post('/auth/signup')
      .send({ name: 'A', email: 'bad', password: 'short' }).expect(400);
  });
});

describe('centres and tests', () => {
  test('creates a centre, a test, and an offering with a centre-specific price', async () => {
    const { centre, test, offering } = await createOffering(firstUser.token);
    expect(centre.name).toBe('Central Diagnostics');
    expect(test.name).toBe('Complete Blood Count');
    expect(Number(offering.price)).toBe(850);

    const listing = await request(app).get(`/centres/${centre.id}/tests`).expect(200);
    expect(listing.body.data).toHaveLength(1);
    expect(listing.body.data[0].test_id).toBe(test.id);
  });

  test('requires authentication for catalogue writes and returns 404 for invalid IDs', async () => {
    await request(app).post('/centres').send({ name: 'Unauth centre', location: 'Pune' }).expect(401);
    await request(app).get('/centres/99999').expect(404);
    await request(app).get('/centres/not-an-id').expect(400);
  });

  test('returns 404 when an offering references a missing test', async () => {
    const centre = await request(app).post('/centres').set('Authorization', `Bearer ${firstUser.token}`)
      .send({ name: 'Another Centre', location: 'Mumbai' }).expect(201);
    await request(app).post(`/centres/${centre.body.data.id}/tests`)
      .set('Authorization', `Bearer ${firstUser.token}`).send({ test_id: 99999, price: 10 }).expect(404);
  });
});

describe('bookings', () => {
  test('creates a booking with the current price snapshot', async () => {
    const { offering } = await createOffering(firstUser.token);
    const response = await createBooking(firstUser.token, offering.id);
    expect(response.body.data.status).toBe('PENDING');
    expect(Number(response.body.data.amount)).toBe(850);
  });

  test('requires authentication and rejects a missing centre/test offering', async () => {
    await request(app).post('/bookings').send({}).expect(401);
    await request(app).post('/bookings').set('Authorization', `Bearer ${firstUser.token}`)
      .send({ centre_test_id: 99999, appointment_time: new Date(Date.now() + 86400000).toISOString() }).expect(404);
  });

  test('does not expose another user booking and only cancels pending bookings', async () => {
    const { offering } = await createOffering(firstUser.token);
    const created = await createBooking(firstUser.token, offering.id);
    const bookingId = created.body.data.id;
    await request(app).get(`/bookings/${bookingId}`).set('Authorization', `Bearer ${secondUser.token}`).expect(404);

    const cancelled = await request(app).patch(`/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${firstUser.token}`).expect(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');
    await request(app).patch(`/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${firstUser.token}`).expect(409);
  });

  test('cannot cancel a confirmed booking or pay for a cancelled booking', async () => {
    const { offering } = await createOffering(firstUser.token);
    const created = await createBooking(firstUser.token, offering.id);
    const bookingId = created.body.data.id;
    await request(app).post('/payments').set('Authorization', `Bearer ${firstUser.token}`)
      .send({ booking_id: bookingId }).expect(201);
    await request(app).patch(`/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${firstUser.token}`).expect(409);

    const anotherBooking = await createBooking(firstUser.token, offering.id);
    await request(app).patch(`/bookings/${anotherBooking.body.data.id}/cancel`)
      .set('Authorization', `Bearer ${firstUser.token}`).expect(200);
    await request(app).post('/payments').set('Authorization', `Bearer ${firstUser.token}`)
      .send({ booking_id: anotherBooking.body.data.id }).expect(409);
  });
});

describe('simulated payments', () => {
  test('records successful payment and confirms booking', async () => {
    process.env.PAYMENT_SUCCESS_RATE = '1';
    const { offering } = await createOffering(firstUser.token);
    const booking = await createBooking(firstUser.token, offering.id);
    const response = await request(app).post('/payments').set('Authorization', `Bearer ${firstUser.token}`)
      .send({ booking_id: booking.body.data.id }).expect(201);
    expect(response.body.data.payment.status).toBe('SUCCESS');
    expect(response.body.data.booking.status).toBe('CONFIRMED');
  });

  test('records failed payment and marks booking failed', async () => {
    process.env.PAYMENT_SUCCESS_RATE = '0';
    const { offering } = await createOffering(firstUser.token);
    const booking = await createBooking(firstUser.token, offering.id);
    const response = await request(app).post('/payments').set('Authorization', `Bearer ${firstUser.token}`)
      .send({ booking_id: booking.body.data.id }).expect(201);
    expect(response.body.data.payment.status).toBe('FAILED');
    expect(response.body.data.booking.status).toBe('FAILED');
    process.env.PAYMENT_SUCCESS_RATE = '1';
  });

  test('rejects another user payment and missing bookings', async () => {
    const { offering } = await createOffering(firstUser.token);
    const booking = await createBooking(firstUser.token, offering.id);
    await request(app).post('/payments').set('Authorization', `Bearer ${secondUser.token}`)
      .send({ booking_id: booking.body.data.id }).expect(403);
    await request(app).post('/payments').set('Authorization', `Bearer ${firstUser.token}`)
      .send({ booking_id: 99999 }).expect(404);
  });
});

describe('payment webhooks', () => {
  test('processes an event once and keeps one payment row on duplicate delivery', async () => {
    const { offering } = await createOffering(firstUser.token);
    const booking = await createBooking(firstUser.token, offering.id);
    const payment = await request(app).post('/payments').set('Authorization', `Bearer ${firstUser.token}`)
      .send({ booking_id: booking.body.data.id }).expect(201);
    const event = {
      event_id: 'evt_once',
      event_type: 'payment.status_updated',
      payment_id: payment.body.data.payment.provider_payment_id,
      booking_id: booking.body.data.id,
      status: 'SUCCESS'
    };

    const first = await request(app).post('/payments/webhook')
      .set('x-webhook-secret', process.env.WEBHOOK_SECRET).send(event).expect(200);
    const second = await request(app).post('/payments/webhook')
      .set('x-webhook-secret', process.env.WEBHOOK_SECRET).send(event).expect(200);
    expect(first.body.data.duplicate).toBe(false);
    expect(second.body.data.duplicate).toBe(true);
    expect((await pool.query('SELECT COUNT(*) FROM payments')).rows[0].count).toBe('1');
    expect((await pool.query('SELECT COUNT(*) FROM webhook_events')).rows[0].count).toBe('1');
  });

  test('rejects invalid events and safely handles unknown booking or payment IDs', async () => {
    const secret = process.env.WEBHOOK_SECRET;
    await request(app).post('/payments/webhook').set('x-webhook-secret', secret)
      .send({ event_id: '', event_type: 'payment.status_updated', payment_id: 'pay_missing', booking_id: 1, status: 'SUCCESS' })
      .expect(400);

    const base = { event_type: 'payment.status_updated', status: 'SUCCESS' };
    await request(app).post('/payments/webhook').set('x-webhook-secret', secret)
      .send({ ...base, event_id: 'evt_unknown_booking', payment_id: 'pay_missing', booking_id: 99999 }).expect(404);

    const { offering } = await createOffering(firstUser.token);
    const booking = await createBooking(firstUser.token, offering.id);
    await request(app).post('/payments/webhook').set('x-webhook-secret', secret)
      .send({ ...base, event_id: 'evt_unknown_payment', payment_id: 'pay_missing', booking_id: booking.body.data.id }).expect(404);
    expect((await pool.query('SELECT COUNT(*) FROM webhook_events')).rows[0].count).toBe('0');
  });

  test('rejects requests without the webhook secret', async () => {
    await request(app).post('/payments/webhook').send({
      event_id: 'evt_missing_secret',
      event_type: 'payment.status_updated',
      payment_id: 'pay_example',
      booking_id: 1,
      status: 'SUCCESS'
    }).expect(401);
  });
});