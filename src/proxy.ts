import { NextRequest, NextResponse } from "next/server";
import { checkRequest } from "@/lib/security/request-guard";

function makeCsp(nonce: string): string {
  // Local PDF.js workers and Tesseract OCR compile bundled WebAssembly files.
  const scriptSrc = `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`;
  return [
    "default-src 'self'",
    scriptSrc,
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID();
  const result = checkRequest({
    method: request.method,
    pathname: request.nextUrl.pathname,
    host: request.headers.get("host"),
    origin: request.headers.get("origin"),
    headers: request.headers,
  });
  if (!result.ok) {
    const response = new NextResponse(result.reason, {
      status: result.status,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
    setSecurityHeaders(response, nonce);
    return response;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", makeCsp(nonce));
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  setSecurityHeaders(response, nonce);
  return response;
}

function setSecurityHeaders(response: NextResponse, nonce: string): void {
  response.headers.set("Content-Security-Policy", makeCsp(nonce));
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("X-Frame-Options", "DENY");
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
