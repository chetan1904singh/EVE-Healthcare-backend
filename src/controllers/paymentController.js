const { timingSafeEqual } = require('crypto');
const service = require('../services/paymentService');
const AppError = require('../utils/AppError');

async function createPayment(req, res) {
  const data = await service.processPayment(req.user.id, req.body.booking_id);
  return res.status(201).json({ success: true, data });
}

async function webhook(req, res) {
  const expected = process.env.WEBHOOK_SECRET || '';
  const supplied = req.get('x-webhook-secret') || '';
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  if (!expected || expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) {
    throw new AppError('Invalid webhook credentials', 401);
  }

  const data = await service.processWebhook(req.body);
  return res.json({ success: true, data, message: data.duplicate ? 'Event already processed' : undefined });
}

module.exports = { createPayment, webhook };