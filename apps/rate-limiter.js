/**
 * API Rate Limiter - sliding window implementation
 */
const rateLimit = new Map();

function checkRateLimit(clientId, maxRequests = 100, windowMs = 60000) {
  const now = Date.now();
  const window = rateLimit.get(clientId) || [];
  
  // Remove expired entries
  const active = window.filter(ts => now - ts < windowMs);
  
  if (active.length >= maxRequests) {
    return { allowed: false, retryAfter: Math.ceil((active[0] + windowMs - now) / 1000) };
  }
  
  active.push(now);
  rateLimit.set(clientId, active);
  return { allowed: true, remaining: maxRequests - active.length };
}

module.exports = { checkRateLimit };
