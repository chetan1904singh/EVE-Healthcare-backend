module.exports = (error, req, res, _next) => {
  if (res.headersSent) return;

  const statusCode = Number.isInteger(error.statusCode)
    ? error.statusCode
    : error.type === 'entity.parse.failed' ? 400 : 500;
  const message = statusCode === 500 ? 'Internal server error' : error.message;
  if (statusCode === 500) console.error(error);

  return res.status(statusCode).json({ success: false, message });
};