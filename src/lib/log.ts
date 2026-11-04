const SECRET_PATTERNS = [
  /\bsk-ant-[A-Za-z0-9_-]{8,}\b/g,
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  /\bAIza[A-Za-z0-9_-]{8,}\b/g,
  /\bgsk_[A-Za-z0-9_-]{8,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi,
];

export function redact(value: unknown): string {
  let text = typeof value === "string" ? value : JSON.stringify(value);
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, "[REDACTED]");
  return text;
}

export const logger = {
  info(message: string, details?: unknown) {
    console.info(redact(message), details === undefined ? "" : redact(details));
  },
  warn(message: string, details?: unknown) {
    console.warn(redact(message), details === undefined ? "" : redact(details));
  },
  error(message: string, details?: unknown) {
    console.error(redact(message), details === undefined ? "" : redact(details));
  },
};
