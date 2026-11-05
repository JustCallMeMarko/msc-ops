export type GuardInput = {
  method: string;
  pathname: string;
  host: string | null;
  origin: string | null;
  headers: Headers | Record<string, string | null | undefined>;
};

export type GuardResult = { ok: true } | { ok: false; status: 403 | 421; reason: string };

function headerValue(
  headers: GuardInput["headers"],
  name: string,
): string | null {
  if (headers instanceof Headers) return headers.get(name);
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry?.[1] ?? null;
}

function hostName(host: string | null): string | null {
  if (!host) return null;
  try {
    return new URL(`http://${host}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function checkRequest(input: GuardInput): GuardResult {
  const requestHost = hostName(input.host);
  const allowedHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (process.env.MSC_LAN_HOST) {
    allowedHosts.add(hostName(process.env.MSC_LAN_HOST) ?? process.env.MSC_LAN_HOST.toLowerCase());
  }
  if (!requestHost || !allowedHosts.has(requestHost)) {
    return { ok: false, status: 421, reason: "Unrecognized Host header." };
  }

  const method = input.method.toUpperCase();
  if (input.pathname.startsWith("/api/") && method !== "GET" && method !== "HEAD") {
    if (headerValue(input.headers, "x-msc-client") !== "1") {
      return { ok: false, status: 403, reason: "Missing required client header." };
    }
    if (!input.origin) {
      return { ok: false, status: 403, reason: "Missing Origin header." };
    }
    let originHost: string | null = null;
    try {
      originHost = new URL(input.origin).host.toLowerCase();
    } catch {
      return { ok: false, status: 403, reason: "Invalid Origin header." };
    }
    if (originHost !== input.host?.toLowerCase()) {
      return { ok: false, status: 403, reason: "Origin does not match Host." };
    }
  }

  return { ok: true };
}
