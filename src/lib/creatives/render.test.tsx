import { describe, expect, it, vi } from "vitest";
import { renderCreativeImage } from "./render";

describe("offline creative rendering", () => {
  it("renders Dasmariñas with the local party-popper asset and makes no network calls", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await renderCreativeImage({
      kind: "countdown", title: "Dasmariñas 🎉", eventName: "Dasmariñas 🎉", date: "Nov 14, 2026",
      venue: "Activity Center", days: 3, attendance: 0, target: 0, width: 1080, height: 1350,
      colors: { primary: "#0969da", secondary: "#1f6feb", accent: "#bf8700", background: "#0d1117", text: "#f0f6fc" },
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const requestedUrls = fetchSpy.mock.calls.map(([input]) =>
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    expect(requestedUrls.filter((url) => /^https?:/i.test(url))).toEqual([]);
    fetchSpy.mockRestore();
  });
});
