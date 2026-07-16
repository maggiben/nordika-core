export type ProgressAiProvider = 'openai' | 'anthropic';

export type ProgressAiSettings = {
  provider: ProgressAiProvider;
  model: string;
};

export const OPENAI_PROGRESS_MODELS = ['gpt-4o-mini', 'gpt-4o'] as const;
export const ANTHROPIC_PROGRESS_MODELS = [
  'claude-sonnet-4-5',
  'claude-haiku-4-5',
  'claude-sonnet-5',
] as const;

export const DEFAULT_PROGRESS_AI_MODELS: Record<ProgressAiProvider, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-5',
};

export function isProgressAiProvider(
  value: unknown,
): value is ProgressAiProvider {
  return value === 'openai' || value === 'anthropic';
}

export function isAllowedProgressAiModel(
  provider: ProgressAiProvider,
  model: string,
): boolean {
  const allowed =
    provider === 'openai' ? OPENAI_PROGRESS_MODELS : ANTHROPIC_PROGRESS_MODELS;
  return (allowed as readonly string[]).includes(model);
}

export function normalizeProgressAi(
  value: unknown,
): ProgressAiSettings | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (!isProgressAiProvider(record.provider)) {
    return undefined;
  }
  if (typeof record.model !== 'string' || !record.model.trim()) {
    return undefined;
  }
  const model = record.model.trim();
  if (!isAllowedProgressAiModel(record.provider, model)) {
    return undefined;
  }
  return { provider: record.provider, model };
}
