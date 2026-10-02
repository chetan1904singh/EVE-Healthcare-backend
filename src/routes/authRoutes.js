const express = require('express');
const { asyncHandler, validate } = require('./routeTools');
const controller = require('../controllers/authController');
const { signupRules, loginRules } = require('../middleware/validators');

const router = express.Router();
router.post('/signup', signupRules, validate, asyncHandler(controller.signup));
router.post('/login', loginRules, validate, asyncHandler(controller.login));

module.exports = router;