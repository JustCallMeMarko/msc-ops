import { describe, expect, it } from "vitest";
import { LABEL_COLOR_TOKENS } from "./label";

function luminance(hex: string): number {
  const channels = hex.match(/[a-f\d]{2}/gi)!.map((channel) => parseInt(channel, 16) / 255);
  const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground: string, background: string): number {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe("Primer label color contrast", () => {
  for (const [color, themes] of Object.entries(LABEL_COLOR_TOKENS)) {
    for (const [theme, tokens] of Object.entries(themes)) {
      it(`${color} meets 4.5:1 in ${theme} mode`, () => {
        expect(contrast(tokens.fg, tokens.bg)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
