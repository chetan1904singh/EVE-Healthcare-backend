const express = require('express');
const auth = require('../middleware/auth');
const { asyncHandler, validate } = require('./routeTools');
const controller = require('../controllers/catalogueController');
const { positiveId, centreRules, testRules, centreTestRules } = require('../middleware/validators');

const router = express.Router();
router.get('/centres', asyncHandler(controller.listCentres));
router.post('/centres', auth, centreRules, validate, asyncHandler(controller.createCentre));
router.get('/centres/:id', positiveId('id'), validate, asyncHandler(controller.getCentre));
router.get('/centres/:id/tests', positiveId('id'), validate, asyncHandler(controller.listCentreTests));
router.post('/centres/:id/tests', auth, positiveId('id'), centreTestRules, validate, asyncHandler(controller.associateTest));
router.get('/tests', asyncHandler(controller.listTests));
router.post('/tests', auth, testRules, validate, asyncHandler(controller.createTest));

module.exports = router;