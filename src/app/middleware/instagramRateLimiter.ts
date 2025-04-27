// middleware/instagramRateLimiter.ts
import { NextResponse, NextRequest } from 'next/server';
import { LRUCache } from 'lru-cache';

// Cache for storing request counts
const cache = new LRUCache<string, number | boolean>({
    max: 500, // Maximum number of items in cache
    ttl: 1000 * 60 * 15, // Time to live: 15 minutes
});

// Limit definitions
const REQUESTS_PER_IP_LIMIT = 20; // Per 15 minutes
const COOLDOWN_PERIOD = 1000 * 60 * 5; // 5 minutes in milliseconds

/**
 * Middleware to handle rate limiting for Instagram API requests
 * This prevents IP bans from Instagram due to too many requests
 */
export function middleware(request: NextRequest) {
    // Only apply rate limiting to the Instagram API route
    if (!request.nextUrl.pathname.startsWith('/api/instagram-proxy')) {
        return NextResponse.next();
    }

    // Get client IP
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0].trim() : '127.0.0.1';

    // Check if this IP is currently in cooldown
    const cooldownKey = `cooldown-${ip}`;
    if (cache.get(cooldownKey)) {
        return new NextResponse(
            JSON.stringify({
                error: 'Too many requests',
                message: 'Please try again later'
            }),
            {
                status: 429,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }

    // Get current request count for this IP
    const requestKey = `requests-${ip}`;
    const currentRequests = (cache.get(requestKey) as number) || 0;

    // Increment request count
    cache.set(requestKey, currentRequests + 1);

    // If the IP has exceeded limits, put them in cooldown
    if (currentRequests >= REQUESTS_PER_IP_LIMIT) {
        cache.set(cooldownKey, true, { ttl: COOLDOWN_PERIOD });
        return new NextResponse(
            JSON.stringify({
                error: 'Rate limit exceeded',
                message: 'Too many requests, please try again later'
            }),
            {
                status: 429,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }

    // Add rate limit headers for transparency
    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Limit', REQUESTS_PER_IP_LIMIT.toString());
    response.headers.set('X-RateLimit-Remaining', (REQUESTS_PER_IP_LIMIT - currentRequests - 1).toString());

    return response;
}

export const config = {
    matcher: '/api/instagram-proxy',
};
