const service = require('../services/bookingService');

async function createBooking(req, res) {
  const data = await service.createBooking(req.user.id, req.body);
  return res.status(201).json({ success: true, data });
}

async function listBookings(req, res) {
  return res.json({ success: true, data: await service.listBookings(req.user.id) });
}

async function getBooking(req, res) {
  return res.json({ success: true, data: await service.getBooking(req.user.id, req.params.id) });
}

async function cancelBooking(req, res) {
  return res.json({ success: true, data: await service.cancelBooking(req.user.id, req.params.id) });
}

module.exports = { createBooking, listBookings, getBooking, cancelBooking };