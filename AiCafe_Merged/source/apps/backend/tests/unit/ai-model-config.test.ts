import { readFileSync } from 'fs';
import { join } from 'path';
import { KNOWN_RETIRED_MODELS, resolveAIProviders } from '../../src/ai/providers';

// GAP-03: GEMINI_MODEL=gemini-2.0-flash (retired, HTTP 404) in .env overrode the working default and
// disabled the primary provider on every boot.
describe('AI model configuration', () => {
  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  test('a retired GEMINI_MODEL is ignored and the built-in defaults are used', () => {
    const [gemini] = resolveAIProviders({ AI_PROVIDER_ORDER: 'gemini', GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-2.0-flash' } as any);
    expect(gemini.models).toEqual(['gemini-3.6-flash', 'gemini-3.5-flash']);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('retired'));
  });

  test('retired ids are dropped from a mixed list, valid ones keep their order', () => {
    const [gemini] = resolveAIProviders({
      AI_PROVIDER_ORDER: 'gemini',
      GEMINI_API_KEY: 'k',
      GEMINI_MODEL: 'gemini-2.5-flash, gemini-3.5-flash',
    } as any);
    expect(gemini.models).toEqual(['gemini-3.5-flash']);
  });

  test('a current model list is untouched and produces no warning', () => {
    const [groq] = resolveAIProviders({ AI_PROVIDER_ORDER: 'groq', GROQ_API_KEY: 'k', GROQ_MODEL: 'openai/gpt-oss-120b' } as any);
    expect(groq.models).toEqual(['openai/gpt-oss-120b']);
    expect(console.warn).not.toHaveBeenCalled();
  });

  test('no checked-in example or default configures a retired model', () => {
    const example = readFileSync(join(__dirname, '../../.env.example'), 'utf8');
    for (const line of example.split(/\r?\n/)) {
      if (/^\s*#/.test(line)) continue;
      const m = /^[A-Z_]*MODEL=(.*)$/.exec(line.trim());
      if (!m) continue;
      for (const id of m[1].split(',').map((s) => s.trim()).filter(Boolean)) {
        expect(KNOWN_RETIRED_MODELS.has(id)).toBe(false);
      }
    }
  });
});
