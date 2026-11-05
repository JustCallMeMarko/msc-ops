export function isReadableHeading(value: string): boolean {
  const text = value.trim();
  if (!text || !/^[A-Za-z0-9\s›&'().,:/-]+$/.test(text)) return false;
  const words = text.match(/[A-Za-z]+(?:[-'][A-Za-z]+)*/g) ?? [];
  const meaningful = words.filter((word) => word.replace(/[-']/g, "").length >= 3);
  const visible = text.replace(/\s/g, "");
  const readable = text.replace(/[^A-Za-z0-9]/g, "");
  return meaningful.length >= 2
    && meaningful.every((word) => /[aeiouy]/i.test(word))
    && readable.length / Math.max(1, visible.length) >= 0.7;
}

export function suggestionHeading(value: string): boolean {
  const leaf = value.split("›").at(-1)?.trim().replace(/^[A-Z]\.\s*/, "") ?? value.trim();
  return isReadableHeading(leaf) || /^fundraising$/i.test(leaf);
}

export function sectionSuggestionLabel(value: string): string {
  const leaf = value.split("›").at(-1)?.trim().replace(/^[A-Z]\.\s*/, "") ?? value.trim();
  return leaf.toLocaleLowerCase("en").replace(/(^|[\s-])([a-z])/g, (_match, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase("en")}`);
}
