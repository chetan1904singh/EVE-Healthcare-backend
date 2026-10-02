const service = require('../services/catalogueService');

async function createCentre(req, res) {
  const data = await service.createCentre(req.body);
  return res.status(201).json({ success: true, data });
}

async function listCentres(_req, res) {
  return res.json({ success: true, data: await service.listCentres() });
}

async function getCentre(req, res) {
  return res.json({ success: true, data: await service.getCentre(req.params.id) });
}

async function createTest(req, res) {
  const data = await service.createTest(req.body);
  return res.status(201).json({ success: true, data });
}

async function listTests(_req, res) {
  return res.json({ success: true, data: await service.listTests() });
}

async function associateTest(req, res) {
  const data = await service.associateTest(req.params.id, req.body);
  return res.status(201).json({ success: true, data });
}

async function listCentreTests(req, res) {
  return res.json({ success: true, data: await service.listCentreTests(req.params.id) });
}

module.exports = { createCentre, listCentres, getCentre, createTest, listTests, associateTest, listCentreTests };