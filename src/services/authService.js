const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const AppError = require('../utils/AppError');

async function signup({ name, email, password }) {
  const passwordHash = await bcrypt.hash(password, Number(process.env.BCRYPT_ROUNDS) || 12);

  try {
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, created_at',
      [name.trim(), email.toLowerCase(), passwordHash]
    );
    return result.rows[0];
  } catch (error) {
    if (error.code === '23505') throw new AppError('An account with this email already exists', 409);
    throw error;
  }
}

async function login({ email, password }) {
  const result = await pool.query('SELECT id, name, email, password_hash FROM users WHERE email = $1', [email.toLowerCase()]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new AppError('Invalid email or password', 401);
  }
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured');

  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d'
  });
  return { token, user: { id: user.id, name: user.name, email: user.email } };
}

module.exports = { signup, login };