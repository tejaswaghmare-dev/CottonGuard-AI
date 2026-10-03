function errorHandler(err, req, res, next) {
  console.error('[error]', err);

  if (err.name === 'ValidationError' || err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: err.message || 'Invalid request' });
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'Image too large. Max 8MB.' });
  }

  if (err.message && err.message.includes('Only JPEG')) {
    return res.status(400).json({ success: false, message: err.message });
  }

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

function notFound(req, res) {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.path}` });
}

module.exports = { errorHandler, notFound };
