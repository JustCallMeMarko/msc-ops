import { describe, expect, it } from "vitest";
import { checkRequest } from "./request-guard";

describe("checkRequest", () => {
  it("rejects an untrusted Host", () => {
    expect(checkRequest({ method: "GET", pathname: "/api/health", host: "evil.example", origin: null, headers: {} })).toMatchObject({ ok: false, status: 421 });
  });

  it("requires the client marker on mutating API requests", () => {
    expect(checkRequest({ method: "POST", pathname: "/api/settings", host: "localhost:3000", origin: "http://localhost:3000", headers: {} })).toMatchObject({ ok: false, status: 403 });
  });

  it("rejects a mismatched Origin", () => {
    expect(checkRequest({ method: "POST", pathname: "/api/settings", host: "localhost:3000", origin: "http://evil.example", headers: { "x-msc-client": "1" } })).toMatchObject({ ok: false, status: 403 });
  });

  it("allows a localhost GET", () => {
    expect(checkRequest({ method: "GET", pathname: "/api/health", host: "localhost:3000", origin: null, headers: {} })).toEqual({ ok: true });
  });
});
