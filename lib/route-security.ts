import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Upstash Redis rate limiter (distributed, works on serverless)
// Falls back to in-memory Map for local dev when UPSTASH env vars are missing
const useUpstash = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN;

const upstashRatelimit = useUpstash
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(60, "60 s"),
      analytics: true,
      prefix: "hygiene_admin",
    })
  : null;

// In-memory fallback for local dev only
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function getIp(request: NextRequest) {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

export async function enforceRateLimit(
  request: NextRequest,
  keyPrefix: string,
  limit = 60,
  windowMs = 60_000,
) {
  const ip = getIp(request);
  const key = `${keyPrefix}:${ip}`;

  // Use Upstash in production
  if (upstashRatelimit) {
    const { success, limit: rlLimit, remaining, reset } = await upstashRatelimit.limit(key);
    if (!success) {
      return NextResponse.json(
        { success: false, message: "Too many requests" },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": String(rlLimit),
            "X-RateLimit-Remaining": String(remaining),
            "X-RateLimit-Reset": String(reset),
          },
        },
      );
    }
    return null;
  }

  // In-memory fallback for local dev
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  if (current.count >= limit) {
    return NextResponse.json(
      { success: false, message: "Too many requests" },
      { status: 429 },
    );
  }

  current.count += 1;
  buckets.set(key, current);
  return null;
}

export function enforceTrustedOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return null;

  const trusted = new Set(
    (process.env.ADMIN_TRUSTED_ORIGINS || process.env.NEXT_PUBLIC_APP_ORIGIN || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  );

  if (trusted.size === 0) {
    const host = request.headers.get("host");
    if (!host) return null;
    const inferredOrigin = `${request.nextUrl.protocol}//${host}`;
    trusted.add(inferredOrigin);
  }

  if (!trusted.has(origin)) {
    return NextResponse.json(
      { success: false, message: "Untrusted origin" },
      { status: 403 },
    );
  }

  return null;
}
