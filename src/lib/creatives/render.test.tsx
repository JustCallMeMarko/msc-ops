import { afterEach, describe, expect, it, vi } from "vitest";
import { loadAdditionalAsset, renderCreativeImage } from "./render";

describe("offline creative rendering", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders countdown, poster, and highlight layouts without network requests", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const colors = { primary: "#0969da", secondary: "#1f6feb", accent: "#bf8700", background: "#0d1117", text: "#f0f6fc" };
    const partyPopper = await loadAdditionalAsset("1f389");
    const base = {
      title: "Dasmariñas 🎉", eventName: "Dasmariñas 🎉", date: "Nov 14, 2026",
      venue: "Activity Center", days: 3, attendance: 120, target: 150, width: 1080, height: 1350, colors,
    };
    const cases = [
      { kind: "countdown" as const },
      { kind: "poster" as const },
      ...[4, 6, 9].map((count) => ({ kind: "highlight" as const, photos: Array(count).fill(partyPopper) })),
    ];
    for (const input of cases) {
      const response = await renderCreativeImage({ ...base, ...input });
      const bytes = new Uint8Array(await response.arrayBuffer());
      expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    }
    const requestedUrls = fetchSpy.mock.calls.map(([input]) =>
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    expect(requestedUrls.filter((url) => /^https?:/i.test(url))).toEqual([]);
    fetchSpy.mockRestore();
  });
});
