/** Masks credential-looking fragments so an upstream error can never leak a secret into the model context. */
export function redactSecrets(text: string): string {
  return text
    .replace(/(client[_-]?secret|secret|password|api[_-]?key|access[_-]?token|token)(["']?\s*[=:]\s*["']?)[^\s"',;}]+/gi, '$1$2[redacted]')
    // Bare provider keys that appear without a "key=" label, e.g. OpenAI's
    // "Incorrect API key provided: sk-proj-..." (OpenAI sk-, Groq gsk_, Google AIza).
    .replace(/\bsk-[A-Za-z0-9_-]{3,}/g, 'sk-[redacted]')
    .replace(/\bgsk_[A-Za-z0-9_-]{3,}/g, 'gsk_[redacted]')
    .replace(/\bAIza[0-9A-Za-z_-]{10,}/g, 'AIza[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
    .replace(/Basic\s+[A-Za-z0-9+/]+=*/gi, 'Basic [redacted]');
}
