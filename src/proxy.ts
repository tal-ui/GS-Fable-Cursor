import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "scrm_session";
const PUBLIC_PATHS = new Set(["/login", "/pending", "/api/health"]);
const WEBHOOK_PREFIX = "/api/webhooks/";
const PER_USER_PER_MINUTE = Number(process.env.RATE_LIMIT_PER_USER_PER_MINUTE ?? 100);
const PER_IP_PER_MINUTE = Number(process.env.RATE_LIMIT_PER_IP_PER_MINUTE ?? 1000);
const WINDOW_MS = 60_000;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function limited(key: string, max: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    if (buckets.size > 50_000) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    }
    return false;
  }
  bucket.count += 1;
  return bucket.count > max;
}

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded ? forwarded.split(",")[0]!.trim() : (request.headers.get("x-real-ip") ?? "unknown");
}

function isStateChanging(method: string): boolean {
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const ip = clientIp(request);
  const session = request.cookies.get(SESSION_COOKIE)?.value;

  if (limited(`ip:${ip}`, PER_IP_PER_MINUTE) || (session && limited(`s:${session.slice(0, 24)}`, PER_USER_PER_MINUTE))) {
    return new NextResponse(JSON.stringify({ error: "Too many requests. Please slow down." }), {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": "60" },
    });
  }

  if (pathname.startsWith("/api/")) {
    // Webhooks are authenticated by provider signatures; everything else must be same-origin when mutating.
    if (!pathname.startsWith(WEBHOOK_PREFIX) && isStateChanging(request.method) && !sameOrigin(request)) {
      return new NextResponse(JSON.stringify({ error: "Cross-site request blocked." }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    }
    return NextResponse.next();
  }

  // Candidate-facing upload pages are authenticated by their single-use token, not a staff session.
  const isPublic = PUBLIC_PATHS.has(pathname) || pathname === "/" || pathname.startsWith("/upload/");
  if (!isPublic && !session) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-invoke-path", pathname);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-frame-options", "DENY");
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("referrer-policy", "same-origin");
  return response;
}

export const config = {
  // /.well-known/ holds public validation files (e.g. the GoDaddy SSL check) that must never redirect to /login.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|\\.well-known/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)"],
};
