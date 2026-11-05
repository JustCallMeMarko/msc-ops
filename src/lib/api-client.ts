"use client";

export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("X-MSC-Client", "1");
  return fetch(input, { ...init, headers });
}
