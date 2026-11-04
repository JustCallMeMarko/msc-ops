export const PROVIDER_TYPES = {
  ollama: { label: "Ollama", defaultBaseUrl: "http://127.0.0.1:11434/v1", needsKey: false, isLocal: true },
  lmstudio: { label: "LM Studio", defaultBaseUrl: "http://127.0.0.1:1234/v1", needsKey: false, isLocal: true },
  openai_compatible: { label: "OpenAI-compatible", defaultBaseUrl: "", needsKey: true, isLocal: false },
  openai: { label: "OpenAI", defaultBaseUrl: "https://api.openai.com/v1", needsKey: true, isLocal: false },
  anthropic: { label: "Anthropic", defaultBaseUrl: "https://api.anthropic.com/v1", needsKey: true, isLocal: false },
  google: { label: "Google", defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta", needsKey: true, isLocal: false },
  openrouter: { label: "OpenRouter", defaultBaseUrl: "https://openrouter.ai/api/v1", needsKey: true, isLocal: false },
  groq: { label: "Groq", defaultBaseUrl: "https://api.groq.com/openai/v1", needsKey: true, isLocal: false },
} as const;

export type ProviderType = keyof typeof PROVIDER_TYPES;

export function isLocalProviderUrl(baseUrl: string): boolean {
  try {
    return new Set(["localhost", "127.0.0.1", "::1", "[::1]"]).has(new URL(baseUrl).hostname.toLowerCase());
  } catch {
    return false;
  }
}
