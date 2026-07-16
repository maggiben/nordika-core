import { isAllowedProgressAiModel, normalizeProgressAi } from './progress-ai';

describe('progress-ai helpers', () => {
  it('allows only curated models per provider', () => {
    expect(isAllowedProgressAiModel('openai', 'gpt-4o-mini')).toBe(true);
    expect(isAllowedProgressAiModel('anthropic', 'claude-sonnet-4-5')).toBe(
      true,
    );
    expect(isAllowedProgressAiModel('anthropic', 'gpt-4o')).toBe(false);
    expect(isAllowedProgressAiModel('openai', 'claude-sonnet-4-5')).toBe(false);
  });

  it('normalizes valid progressAi payloads', () => {
    expect(
      normalizeProgressAi({
        provider: 'anthropic',
        model: ' claude-haiku-4-5 ',
      }),
    ).toEqual({ provider: 'anthropic', model: 'claude-haiku-4-5' });
    expect(
      normalizeProgressAi({ provider: 'openai', model: 'nope' }),
    ).toBeUndefined();
    expect(normalizeProgressAi(null)).toBeUndefined();
    expect(
      normalizeProgressAi({ provider: 'gemini', model: 'x' }),
    ).toBeUndefined();
    expect(
      normalizeProgressAi({ provider: 'openai', model: '   ' }),
    ).toBeUndefined();
  });
});
