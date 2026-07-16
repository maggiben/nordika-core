jest.mock('../config/environment', () => ({
  getOpenAIConfig: jest.fn(),
  getAnthropicConfig: jest.fn(),
}));

jest.mock('openai', () => {
  const create = jest.fn();
  const OpenAI = jest.fn().mockImplementation(() => ({
    chat: { completions: { create } },
  }));
  return { __esModule: true, default: OpenAI, create };
});

import { getAnthropicConfig, getOpenAIConfig } from '../config/environment';
import { ProgressParseService } from './progress-parse.service';
import OpenAI from 'openai';

const mockedGetOpenAIConfig = jest.mocked(getOpenAIConfig);
const mockedGetAnthropicConfig = jest.mocked(getAnthropicConfig);
const openaiMockModule: { create: jest.Mock } = jest.requireMock('openai');
const createMock = openaiMockModule.create;
const OpenAIMock = OpenAI as unknown as jest.Mock;

describe('ProgressParseService', () => {
  beforeEach(() => {
    mockedGetOpenAIConfig.mockReset();
    mockedGetAnthropicConfig.mockReset();
    mockedGetAnthropicConfig.mockReturnValue(null);
    createMock.mockReset();
    OpenAIMock.mockClear();
  });

  it('returns null when OpenAI is not configured', async () => {
    mockedGetOpenAIConfig.mockReturnValue(null);
    const service = new ProgressParseService();
    await expect(
      service.parseReply({ replyBody: 'vamos al 40%' }),
    ).resolves.toBeNull();
    expect(OpenAIMock).not.toHaveBeenCalled();
  });

  it('returns null for an empty reply body', async () => {
    mockedGetOpenAIConfig.mockReturnValue({
      apiKey: 'sk-test',
      progressModel: 'gpt-4o-mini',
    });
    const service = new ProgressParseService();
    await expect(service.parseReply({ replyBody: '  ' })).resolves.toBeNull();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('parses structured JSON and clamps percent', async () => {
    mockedGetOpenAIConfig.mockReturnValue({
      apiKey: 'sk-test',
      progressModel: 'gpt-4o-mini',
    });
    createMock.mockResolvedValue({
      model: 'gpt-4o-mini',
      choices: [
        {
          message: {
            content: JSON.stringify({
              percent: 140,
              duration: '2 días',
              avance: 'hormigón listo',
              notes: 'falta pintura',
              byRole: { jefe_obra: -5, operario: 55.6 },
            }),
          },
        },
      ],
    });

    const service = new ProgressParseService();
    const result = await service.parseReply({
      replyBody: 'estamos al 140% casi',
      taskId: 't1',
      taskLabel: 'Hormigón',
      outboundBody: '¿Cómo va el hormigón?',
    });

    expect(result).toEqual({
      percent: 100,
      duration: '2 días',
      avance: 'hormigón listo',
      notes: 'falta pintura',
      byRole: { jefe_obra: 0, operario: 56 },
      model: 'gpt-4o-mini',
    });
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
      }),
    );
  });

  it('returns null and logs when the API fails', async () => {
    mockedGetOpenAIConfig.mockReturnValue({
      apiKey: 'sk-test',
      progressModel: 'gpt-4o',
    });
    createMock.mockRejectedValue(new Error('rate limited'));
    const service = new ProgressParseService();
    const warn = jest.spyOn(service['logger'], 'warn').mockImplementation();

    await expect(service.parseReply({ replyBody: '40%' })).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('rate limited'));
    warn.mockRestore();
  });

  it('returns null when model content is not usable JSON progress', async () => {
    mockedGetOpenAIConfig.mockReturnValue({
      apiKey: 'sk-test',
      progressModel: 'gpt-4o-mini',
    });
    createMock.mockResolvedValue({
      choices: [
        { message: { content: JSON.stringify({ avance: 'solo texto' }) } },
      ],
    });
    const service = new ProgressParseService();
    await expect(
      service.parseReply({ replyBody: 'vamos bien' }),
    ).resolves.toBeNull();
  });

  it('uses Anthropic when settings select anthropic and the key is present', async () => {
    mockedGetOpenAIConfig.mockReturnValue({
      apiKey: 'sk-openai',
      progressModel: 'gpt-4o-mini',
    });
    mockedGetAnthropicConfig.mockReturnValue({
      apiKey: 'sk-ant-test',
      progressModel: 'claude-sonnet-4-5',
    });

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          model: 'claude-sonnet-4-5',
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                percent: 42,
                avance: 'estructura',
              }),
            },
          ],
        }),
    });

    const service = new ProgressParseService();
    service.setAnthropicFetchForTests(fetchMock);
    const result = await service.parseReply({
      replyBody: 'vamos al 42%',
      progressAi: { provider: 'anthropic', model: 'claude-haiku-4-5' },
    });

    expect(result).toEqual({
      percent: 42,
      avance: 'estructura',
      model: 'claude-sonnet-4-5',
    });
    expect(createMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0] as
      | [
          string,
          {
            method?: string;
            headers?: Record<string, string>;
            body: string;
          },
        ]
      | undefined;
    expect(firstCall?.[0]).toBe('https://api.anthropic.com/v1/messages');
    expect(firstCall?.[1]?.method).toBe('POST');
    expect(firstCall?.[1]?.headers?.['x-api-key']).toBe('sk-ant-test');
    const body = JSON.parse(firstCall![1].body) as { model: string };
    expect(body.model).toBe('claude-haiku-4-5');
  });

  it('fails closed when Anthropic is selected but the key is missing', async () => {
    mockedGetOpenAIConfig.mockReturnValue({
      apiKey: 'sk-openai',
      progressModel: 'gpt-4o-mini',
    });
    mockedGetAnthropicConfig.mockReturnValue(null);
    const fetchMock = jest.fn();
    const service = new ProgressParseService();
    service.setAnthropicFetchForTests(fetchMock);
    const warn = jest.spyOn(service['logger'], 'warn').mockImplementation();

    await expect(
      service.parseReply({
        replyBody: '40%',
        progressAi: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
      }),
    ).resolves.toBeNull();

    expect(createMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('ANTHROPIC_API_KEY'),
    );
    warn.mockRestore();
  });

  it('does not call Anthropic when provider is openai or unset', async () => {
    mockedGetOpenAIConfig.mockReturnValue({
      apiKey: 'sk-test',
      progressModel: 'gpt-4o-mini',
    });
    mockedGetAnthropicConfig.mockReturnValue({
      apiKey: 'sk-ant-test',
      progressModel: 'claude-sonnet-4-5',
    });
    createMock.mockResolvedValue({
      model: 'gpt-4o',
      choices: [{ message: { content: JSON.stringify({ percent: 10 }) } }],
    });
    const fetchMock = jest.fn();
    const service = new ProgressParseService();
    service.setAnthropicFetchForTests(fetchMock);

    await expect(
      service.parseReply({
        replyBody: '10%',
        progressAi: { provider: 'openai', model: 'gpt-4o' },
      }),
    ).resolves.toEqual({ percent: 10, model: 'gpt-4o' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-4o' }),
    );
  });

  it('returns null when Anthropic responds with HTTP error', async () => {
    mockedGetOpenAIConfig.mockReturnValue(null);
    mockedGetAnthropicConfig.mockReturnValue({
      apiKey: 'sk-ant-test',
      progressModel: 'claude-sonnet-4-5',
    });
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('rate limited'),
    });
    const service = new ProgressParseService();
    service.setAnthropicFetchForTests(fetchMock);
    const warn = jest.spyOn(service['logger'], 'warn').mockImplementation();

    await expect(
      service.parseReply({
        replyBody: '40%',
        progressAi: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
      }),
    ).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('HTTP 429'));
    warn.mockRestore();
  });

  it('returns null when Anthropic content is empty or non-JSON', async () => {
    mockedGetOpenAIConfig.mockReturnValue(null);
    mockedGetAnthropicConfig.mockReturnValue({
      apiKey: 'sk-ant-test',
      progressModel: 'claude-sonnet-4-5',
    });

    const emptyFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [] }),
    });
    const emptyService = new ProgressParseService();
    emptyService.setAnthropicFetchForTests(emptyFetch);
    await expect(
      emptyService.parseReply({
        replyBody: '40%',
        progressAi: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
      }),
    ).resolves.toBeNull();

    const proseFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [{ type: 'text', text: 'sin json acá' }],
        }),
    });
    const proseService = new ProgressParseService();
    proseService.setAnthropicFetchForTests(proseFetch);
    await expect(
      proseService.parseReply({
        replyBody: '40%',
        progressAi: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
      }),
    ).resolves.toBeNull();
  });

  it('extracts JSON embedded in Anthropic prose and fails closed on throw', async () => {
    mockedGetOpenAIConfig.mockReturnValue(null);
    mockedGetAnthropicConfig.mockReturnValue({
      apiKey: 'sk-ant-test',
      progressModel: 'claude-sonnet-4-5',
    });

    const embeddedFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [
            {
              type: 'text',
              text: 'resultado: {"percent": 33, "avance": "ok"} fin',
            },
          ],
        }),
    });
    const embeddedService = new ProgressParseService();
    embeddedService.setAnthropicFetchForTests(embeddedFetch);
    await expect(
      embeddedService.parseReply({
        replyBody: '33%',
        progressAi: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
      }),
    ).resolves.toEqual({
      percent: 33,
      avance: 'ok',
      model: 'claude-sonnet-4-5',
    });

    const throwFetch = jest.fn().mockRejectedValue('boom');
    const throwService = new ProgressParseService();
    throwService.setAnthropicFetchForTests(throwFetch);
    const warn = jest
      .spyOn(throwService['logger'], 'warn')
      .mockImplementation();
    await expect(
      throwService.parseReply({
        replyBody: '33%',
        progressAi: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
      }),
    ).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Unknown Anthropic error'),
    );
    warn.mockRestore();
  });
});
