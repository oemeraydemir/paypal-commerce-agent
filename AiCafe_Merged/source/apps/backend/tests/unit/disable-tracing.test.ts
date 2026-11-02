import { disableLangSmithTracing, TRACING_ENV_VARS } from '../../src/config/disable-tracing';

describe('LangSmith tracing guard (advisory mitigation)', () => {
  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  test('removes every tracing/endpoint variable and reports only their names', () => {
    const env: NodeJS.ProcessEnv = {
      LANGSMITH_TRACING: 'true',
      LANGCHAIN_TRACING_V2: 'true',
      LANGSMITH_ENDPOINT: 'http://169.254.169.254/',
      LANGSMITH_API_KEY: 'ls-secret-value',
      UNRELATED: 'keep',
    };
    const removed = disableLangSmithTracing(env);
    expect(removed.sort()).toEqual(['LANGCHAIN_TRACING_V2', 'LANGSMITH_ENDPOINT', 'LANGSMITH_TRACING']);
    for (const name of TRACING_ENV_VARS) expect(env[name]).toBeUndefined();
    expect(env.UNRELATED).toBe('keep');
    const logged = (console.warn as jest.Mock).mock.calls.flat().join(' ');
    expect(logged).toContain('LANGSMITH_ENDPOINT');
    expect(logged).not.toContain('169.254');
    expect(logged).not.toContain('ls-secret-value');
  });

  test('is silent when nothing is set', () => {
    expect(disableLangSmithTracing({})).toEqual([]);
    expect(console.warn).not.toHaveBeenCalled();
  });
});
