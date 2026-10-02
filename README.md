# EVE Healthcare Backend

A small Express API for diagnostic centre catalogues, patient bookings, simulated payments, and idempotent payment notifications.

## Stack

Node.js, Express, PostgreSQL (`pg`), JWT, bcryptjs, express-validator, dotenv, cors, Jest, and Supertest. No real payment provider is integrated.

## Structure

```text
src/
  config/db.js             PostgreSQL connection pool
  controllers/             HTTP request/response handling
  middleware/              JWT auth, validation, and errors
  routes/                  API route definitions
  services/                SQL and business rules
  schema.sql               Database schema and indexes
  app.js                   Express application
  server.js                HTTP server and shutdown handling
tests/                     PostgreSQL-backed API tests
```

## Database

`users`, `diagnostic_centres`, and `diagnostic_tests` hold account and catalogue data. `centre_tests` joins tests to centres and stores each centre's price. A booking references that offering and stores its own `amount` snapshot, so later price changes cannot change an existing booking. `payments` enforces one payment per booking, and `webhook_events.event_id` is unique for idempotency. Foreign keys, status checks, positive-price checks, unique constraints, and lookup indexes enforce core invariants.

## Setup

Requirements: Node.js 20+ and a running PostgreSQL 14+ instance. Create a database, then copy `.env.example` to `.env` and set `DATABASE_URL`, `TEST_DATABASE_URL`, `JWT_SECRET`, and `WEBHOOK_SECRET`. Use different secrets in deployed environments and do not commit `.env`.

Apply the schema to the application database:

```sh
psql "$DATABASE_URL" -f src/schema.sql
```

For PowerShell, use `psql $env:DATABASE_URL -f src/schema.sql` after loading the connection URL into the environment. With an existing local PostgreSQL install and default credentials, the example URL targets `localhost:5432/eve_healthcare`.

Install and run:

```sh
npm install
npm run dev
```

The API listens on port 3000 by default. `GET /health` is a small health check. Run production mode with `npm start`.

## Environment

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port, default `3000` |
| `DATABASE_URL` | PostgreSQL URL for the API |
| `TEST_DATABASE_URL` | PostgreSQL URL for tests; use a disposable database |
| `JWT_SECRET` | Secret for signing and verifying access tokens |
| `JWT_EXPIRES_IN` | JWT lifetime, default `1d` |
| `BCRYPT_ROUNDS` | bcrypt cost, default `12` |
| `PAYMENT_SUCCESS_RATE` | Simulated success probability from `0` to `1`, default `0.8` |
| `WEBHOOK_SECRET` | Required value of the webhook `x-webhook-secret` header |

## API

Successful responses use `{ "success": true, "data": ... }`; failures use `{ "success": false, "message": ... }`. Protected routes require `Authorization: Bearer <token>`.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/signup` | No | Create an account |
| POST | `/auth/login` | No | Sign in and receive a JWT |
| POST | `/centres` | Yes | Create a centre |
| GET | `/centres` | No | List centres |
| GET | `/centres/:id` | No | Get one centre |
| POST | `/tests` | Yes | Create a diagnostic test |
| GET | `/tests` | No | List tests |
| POST | `/centres/:id/tests` | Yes | Offer a test at a centre with a price |
| GET | `/centres/:id/tests` | No | List a centre's offerings |
| POST | `/bookings` | Yes | Book an offering |
| GET | `/bookings` | Yes | List the current user's bookings |
| GET | `/bookings/:id` | Yes | Get an owned booking |
| PATCH | `/bookings/:id/cancel` | Yes | Cancel a pending booking |
| POST | `/payments` | Yes | Simulate payment for an owned booking |
| POST | `/payments/webhook` | Shared secret | Apply a payment status event idempotently |

Create a booking with an ISO 8601 future appointment time:

```json
{
  "centre_test_id": 1,
  "appointment_time": "2030-05-10T09:30:00.000Z"
}
```

The returned booking begins as `PENDING` and includes its price snapshot. Payment response shape:

```json
{
  "success": true,
  "data": {
    "payment": { "provider_payment_id": "pay_<generated-id>", "status": "SUCCESS" },
    "booking": { "id": 1, "status": "CONFIRMED" }
  }
}
```

A webhook uses the payment identifier returned by the simulated payment endpoint:

```json
{
  "event_id": "evt_123",
  "event_type": "payment.status_updated",
  "payment_id": "pay_<generated-id>",
  "booking_id": 1,
  "status": "SUCCESS"
}
```

Send `WEBHOOK_SECRET` in `x-webhook-secret`. Unknown booking/payment references are rejected. A status conflicting with an already-final booking is rejected. Repeated event IDs return a successful duplicate response without repeating the database changes.

## Booking and payment flow

An authenticated user books a centre offering. The insert selects the current `centre_tests.price` directly into `bookings.amount`; a missing offering produces 404. Only the owner can inspect, cancel, or pay. Only `PENDING` bookings can be cancelled or paid. Payment locks the booking row, records one generated simulated payment, updates the booking, and commits both changes together. Success confirms the booking; failure marks it failed. Confirmed, failed, and cancelled bookings cannot be paid again.

The webhook inserts its event ID with `ON CONFLICT DO NOTHING` inside the same transaction as its status updates. PostgreSQL's unique constraint arbitrates concurrent deliveries: only the transaction that claims a new event can process it. If reference or state validation fails, the transaction rolls back, including the event claim, so a corrected delivery can be retried.

## Assumptions

- Centre/test catalogues are readable publicly; catalogue writes require any valid account because role management is outside this assignment.
- A booking can have one payment attempt. Failed payments leave the booking in `FAILED`; creating another booking is required to try again.
- Webhooks reconcile a payment already known to the simulated provider and cannot introduce an untracked payment.
- The shared webhook secret is a simple assignment-level authentication mechanism. A real provider integration should verify signed raw request bodies.

## Tests

Set `TEST_DATABASE_URL` to a disposable PostgreSQL database. Jest creates tables in the separate `eve_healthcare_test` schema and truncates test rows between cases; it does not drop the schema. Then run:

```sh
npm test
```

Tests exercise authentication, catalogue creation and missing IDs, booking ownership/cancellation, successful and failed simulated payments, unknown webhook references, and duplicate event delivery. PostgreSQL must be reachable when tests start.

## With more time

Add schema migrations, pagination, rate limiting, password reset and email verification, audit logging, configurable booking policies, and provider-style webhook signature verification and replay-window checks.