/**
 * Simple In-Memory Rate Limiter
 * For production, use Redis-based solution like @upstash/ratelimit
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

interface RateLimitConfig {
  windowMs: number;  // Time window in milliseconds
  maxRequests: number;  // Max requests per window
}

const defaultConfig: RateLimitConfig = {
  windowMs: 60 * 1000,  // 1 minute
  maxRequests: 10,      // 10 requests per minute
};

/**
 * Check if request should be rate limited
 * @param identifier - Unique identifier (IP, user ID, etc.)
 * @param config - Rate limit configuration
 * @returns Object with allowed status and retry-after time
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = defaultConfig
): { allowed: boolean; retryAfter: number; remaining: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  // Clean up expired entries periodically
  if (rateLimitStore.size > 10000) {
    for (const [key, value] of rateLimitStore.entries()) {
      if (now > value.resetTime) {
        rateLimitStore.delete(key);
      }
    }
  }

  if (!entry || now > entry.resetTime) {
    // New window
    rateLimitStore.set(identifier, {
      count: 1,
      resetTime: now + config.windowMs,
    });
    return { 
      allowed: true, 
      retryAfter: 0, 
      remaining: config.maxRequests - 1 
    };
  }

  if (entry.count >= config.maxRequests) {
    // Rate limited
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    return { 
      allowed: false, 
      retryAfter, 
      remaining: 0 
    };
  }

  // Increment count
  entry.count++;
  return { 
    allowed: true, 
    retryAfter: 0, 
    remaining: config.maxRequests - entry.count 
  };
}

/**
 * Rate limit configurations for different endpoints
 */
export const rateLimitConfigs = {
  auth: {
    windowMs: 15 * 60 * 1000,  // 15 minutes
    maxRequests: 5,            // 5 login attempts per 15 min
  },
  api: {
    windowMs: 60 * 1000,       // 1 minute
    maxRequests: 60,           // 60 requests per minute
  },
  webhook: {
    windowMs: 1000,            // 1 second
    maxRequests: 100,          // Allow burst from Stripe
  },
  register: {
    windowMs: 60 * 60 * 1000,  // 1 hour
    maxRequests: 3,            // 3 registrations per hour per IP
  },
};
