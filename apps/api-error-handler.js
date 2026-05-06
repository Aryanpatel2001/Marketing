/**
 * Global API error handler middleware
 * BUG: Accessing error.response.status without null check causes crash
 * when network errors (no response) hit this handler.
 */
function errorHandler(err, req, res, next) {
  // BUG: err.response can be undefined for network timeouts
  const statusCode = err.response.status;  // TypeError: Cannot read property 'status' of undefined
  const message = err.response.data.message;
  
  console.error(`[API Error] ${statusCode}: ${message}`);
  
  res.status(statusCode).json({
    error: message,
    path: req.originalUrl,
    timestamp: new Date().toISOString(),
  });
}

module.exports = { errorHandler };
