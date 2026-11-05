import { isNull } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { getDb } from "@/lib/db/client";
import { networkLog, providers } from "@/lib/db/schema";
import { getSetting } from "@/lib/settings";

export class EgressBlockedError extends Error {
  constructor(host: string) {
    super(`Outbound request to ${host} is blocked by the MSC Ops egress policy.`);
    this.name = "EgressBlockedError";
  }
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
let providerHosts: Set<string> | null = null;

export function invalidateProviderAllowlist(): void {
  providerHosts = null;
}

async function configuredHosts(): Promise<Set<string>> {
  if (providerHosts) return providerHosts;
  const { db } = await getDb();
  const rows = await db
    .select({ baseUrl: providers.baseUrl })
    .from(providers)
    .where(isNull(providers.deletedAt));
  providerHosts = new Set();
  for (const row of rows) {
    try {
      providerHosts.add(new URL(row.baseUrl).hostname.toLowerCase());
    } catch {
      continue;
    }
  }
  return providerHosts;
}

async function writeNetworkLog(entry: {
  host: string;
  method: string;
  path: string;
  purpose: string;
  status: number | null;
  blocked: boolean;
  bytesOut: number;
  bytesIn: number;
  durationMs: number;
}): Promise<void> {
  try {
    const { db } = await getDb();
    await db.insert(networkLog).values({ id: uuidv7(), ...entry });
  } catch (error) {
    console.warn("Network activity could not be recorded.", error);
  }
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function removeBodyHeaders(headers: Headers): void {
  for (const name of ["content-encoding", "content-language", "content-length", "content-location", "content-type"]) {
    headers.delete(name);
  }
}

function redirectedRequest(current: Request, target: URL, status: number): Request {
  let method = current.method;
  const headers = new Headers(current.headers);
  const changesToGet = (status === 303 && method !== "GET" && method !== "HEAD")
    || ((status === 301 || status === 302) && method === "POST");
  const body = changesToGet || !current.body ? undefined : current.clone().body;
  if (changesToGet) {
    method = "GET";
    removeBodyHeaders(headers);
  }
  if (new URL(current.url).origin !== target.origin) {
    for (const name of ["authorization", "proxy-authorization", "cookie", "cookie2"]) headers.delete(name);
  }
  return new Request(target, {
    method,
    headers,
    body,
    redirect: "manual",
    signal: current.signal,
    cache: current.cache,
    credentials: current.credentials,
    integrity: current.integrity,
    keepalive: current.keepalive,
    mode: current.mode,
    referrer: current.referrer,
    referrerPolicy: current.referrerPolicy,
    ...(body ? { duplex: "half" } : {}),
  });
}

export async function safeFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  purpose = "unspecified",
): Promise<Response> {
  const redirectMode = init?.redirect ?? (input instanceof Request ? input.redirect : "follow");
  let request = new Request(input, { ...init, redirect: "manual" });
  const bytesOut =
    typeof init?.body === "string"
      ? Buffer.byteLength(init.body)
      : init?.body instanceof Uint8Array
        ? init.body.byteLength
        : 0;
  let followed = 0;
  while (true) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    const method = request.method.toUpperCase();
    const start = Date.now();
    const hopBytesOut = method === "GET" || method === "HEAD" ? 0 : bytesOut;
    let allowed = LOOPBACK.has(host);
    if (!allowed) {
      const offline = await getSetting("privacy.offlineMode").catch(() => false);
      if (!offline) allowed = (await configuredHosts()).has(host);
    }
    if (!allowed) {
      await writeNetworkLog({
        host,
        method,
        path: url.pathname,
        purpose,
        status: null,
        blocked: true,
        bytesOut: hopBytesOut,
        bytesIn: 0,
        durationMs: Date.now() - start,
      });
      throw new EgressBlockedError(host);
    }
    let response: Response;
    try {
      response = await fetch(request.clone());
    } catch (error) {
      await writeNetworkLog({
        host,
        method,
        path: url.pathname,
        purpose,
        status: null,
        blocked: false,
        bytesOut: hopBytesOut,
        bytesIn: 0,
        durationMs: Date.now() - start,
      });
      throw error;
    }
    await writeNetworkLog({
      host,
      method,
      path: url.pathname,
      purpose,
      status: response.status,
      blocked: false,
      bytesOut: hopBytesOut,
      bytesIn: Number(response.headers.get("content-length") ?? 0),
      durationMs: Date.now() - start,
    });
    const location = response.headers.get("location");
    if (!isRedirect(response.status) || !location || redirectMode === "manual") return response;
    if (redirectMode === "error") throw new TypeError("Redirect encountered while redirect mode is 'error'.");
    if (followed >= 3) throw new TypeError("Too many redirects.");
    request = redirectedRequest(request, new URL(location, url), response.status);
    followed += 1;
  }
}

export function withPurpose(purpose: string): typeof fetch {
  return (input, init) => safeFetch(input, init, purpose);
}
