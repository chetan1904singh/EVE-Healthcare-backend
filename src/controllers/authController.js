const authService = require('../services/authService');

async function signup(req, res) {
  const user = await authService.signup(req.body);
  return res.status(201).json({ success: true, data: { user } });
}

async function login(req, res) {
  const data = await authService.login(req.body);
  return res.json({ success: true, data });
}

module.exports = { signup, login };