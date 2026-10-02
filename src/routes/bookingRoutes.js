const express = require('express');
const auth = require('../middleware/auth');
const { asyncHandler, validate } = require('./routeTools');
const controller = require('../controllers/bookingController');
const { positiveId, bookingRules } = require('../middleware/validators');

const router = express.Router();
router.use(auth);
router.get('/', asyncHandler(controller.listBookings));
router.post('/', bookingRules, validate, asyncHandler(controller.createBooking));
router.get('/:id', positiveId('id'), validate, asyncHandler(controller.getBooking));
router.patch('/:id/cancel', positiveId('id'), validate, asyncHandler(controller.cancelBooking));

module.exports = router;