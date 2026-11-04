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

export async function safeFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  purpose = "unspecified",
): Promise<Response> {
  const requestUrl = input instanceof Request ? input.url : String(input);
  const url = new URL(requestUrl);
  const host = url.hostname.toLowerCase();
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const start = Date.now();
  const bytesOut =
    typeof init?.body === "string"
      ? Buffer.byteLength(init.body)
      : init?.body instanceof Uint8Array
        ? init.body.byteLength
        : 0;
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
      bytesOut,
      bytesIn: 0,
      durationMs: Date.now() - start,
    });
    throw new EgressBlockedError(host);
  }
  try {
    const response = await fetch(input, init);
    await writeNetworkLog({
      host,
      method,
      path: url.pathname,
      purpose,
      status: response.status,
      blocked: false,
      bytesOut,
      bytesIn: Number(response.headers.get("content-length") ?? 0),
      durationMs: Date.now() - start,
    });
    return response;
  } catch (error) {
    await writeNetworkLog({
      host,
      method,
      path: url.pathname,
      purpose,
      status: null,
      blocked: false,
      bytesOut,
      bytesIn: 0,
      durationMs: Date.now() - start,
    });
    throw error;
  }
}

export function withPurpose(purpose: string): typeof fetch {
  return (input, init) => safeFetch(input, init, purpose);
}
