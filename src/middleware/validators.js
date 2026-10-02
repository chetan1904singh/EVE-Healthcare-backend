const { body, param } = require('express-validator');

const positiveId = (field) => param(field).isInt({ min: 1 }).withMessage(`${field} must be a positive integer`).toInt();

const signupRules = [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
  body('email').trim().isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('password').isString().isLength({ min: 8 }).custom((value) =>
    typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 72)
    .withMessage('Password must be at least 8 characters and no more than 72 UTF-8 bytes')
];

const loginRules = [
  body('email').trim().isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('password').isString().notEmpty().withMessage('Password is required')
];

const centreRules = [
  body('name').trim().isLength({ min: 2, max: 150 }).withMessage('Centre name must be between 2 and 150 characters'),
  body('location').trim().isLength({ min: 2, max: 250 }).withMessage('Location must be between 2 and 250 characters')
];

const testRules = [
  body('name').trim().isLength({ min: 2, max: 150 }).withMessage('Test name must be between 2 and 150 characters'),
  body('description').optional().isString().isLength({ max: 5000 }).withMessage('Description is too long')
];

const centreTestRules = [
  body('test_id').isInt({ min: 1 }).withMessage('test_id must be a positive integer').toInt(),
  body('price').isFloat({ gt: 0, max: 99999999.99 }).withMessage('price must be greater than zero').toFloat()
];

const bookingRules = [
  body('centre_test_id').isInt({ min: 1 }).withMessage('centre_test_id must be a positive integer').toInt(),
  body('appointment_time')
    .isISO8601({ strict: true, strictSeparator: true })
    .withMessage('appointment_time must be a valid ISO 8601 date-time')
    .custom((value) => new Date(value).getTime() > Date.now())
    .withMessage('appointment_time must be in the future')
];

const paymentRules = [
  body('booking_id').isInt({ min: 1 }).withMessage('booking_id must be a positive integer').toInt()
];

const webhookRules = [
  body('event_id').isString().trim().isLength({ min: 1, max: 150 }).withMessage('event_id is required'),
  body('event_type').equals('payment.status_updated').withMessage('Unsupported event_type'),
  body('payment_id').isString().trim().isLength({ min: 1, max: 100 }).withMessage('payment_id is required'),
  body('booking_id').isInt({ min: 1 }).withMessage('booking_id must be a positive integer').toInt(),
  body('status').isIn(['SUCCESS', 'FAILED']).withMessage('status must be SUCCESS or FAILED')
];

module.exports = {
  positiveId,
  signupRules,
  loginRules,
  centreRules,
  testRules,
  centreTestRules,
  bookingRules,
  paymentRules,
  webhookRules
};