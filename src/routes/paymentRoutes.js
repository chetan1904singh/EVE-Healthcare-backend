const express = require('express');
const auth = require('../middleware/auth');
const { asyncHandler, validate } = require('./routeTools');
const controller = require('../controllers/paymentController');
const { paymentRules, webhookRules } = require('../middleware/validators');

const router = express.Router();
router.post('/', auth, paymentRules, validate, asyncHandler(controller.createPayment));
router.post('/webhook', webhookRules, validate, asyncHandler(controller.webhook));

module.exports = router;