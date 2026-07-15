jest.mock('../config/environment', () => ({
  getEvolutionConfig: jest.fn(),
}));

import { getEvolutionConfig } from '../config/environment';
import { LocaleService } from '../i18n/locale.service';
import { EvolutionClient } from './evolution.client';

const mockedGetEvolutionConfig = jest.mocked(getEvolutionConfig);

describe('EvolutionClient', () => {
  const originalFetch = global.fetch;
  const locales = new LocaleService();

  afterEach(() => {
    global.fetch = originalFetch;
    mockedGetEvolutionConfig.mockReset();
  });

  it('reports when it is not configured', () => {
    mockedGetEvolutionConfig.mockReturnValue(null);
    expect(new EvolutionClient(locales).isConfigured()).toBe(false);
  });

  it('throws when sending without configuration', async () => {
    mockedGetEvolutionConfig.mockReturnValue(null);
    await expect(
      new EvolutionClient(locales).sendInteractive(
        '5491112345678',
        { text: 'x', widgets: [] },
        'x',
      ),
    ).rejects.toThrow('WhatsApp delivery is not configured.');
  });

  it('sends text with localized input prompts', async () => {
    mockedGetEvolutionConfig.mockReturnValue({
      apiKey: 'key',
      baseUrl: 'https://evolution.example',
      instance: 'nodika',
    });
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ key: { id: 'msg-1' } }),
    });
    global.fetch = fetchMock;

    const result = await new EvolutionClient(locales).sendInteractive(
      '5491112345678',
      {
        text: 'hello',
        widgets: [
          {
            type: 'input',
            id: 'comment',
            label: 'Comentario',
            placeholder: '...',
          },
        ],
      },
      'hello',
      'es',
    );

    expect(result.providerMessageId).toBe('msg-1');
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as { text: string };
    expect(body.text).toContain('Responde con el texto para "comment"');
  });

  it('flattens buttons into sendText (Baileys cannot deliver viewOnce buttons)', async () => {
    mockedGetEvolutionConfig.mockReturnValue({
      apiKey: 'key',
      baseUrl: 'https://evolution.example/',
      instance: 'nodika',
    });
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
    global.fetch = fetchMock;

    await new EvolutionClient(locales).sendInteractive(
      '5491112345678',
      {
        title: 'Status',
        text: '30%',
        footer: 'Nodika',
        widgets: [{ type: 'button', id: 'ack', label: 'Recibido' }],
      },
      '30%',
      'es',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://evolution.example/message/sendText/nodika',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as { text: string };
    expect(body.text).toContain('*Status*');
    expect(body.text).toContain('Responde "ack" para "Recibido".');
    expect(body.text).toContain('_Nodika_');
  });

  it('throws when Evolution returns a non-OK status', async () => {
    mockedGetEvolutionConfig.mockReturnValue({
      apiKey: 'key',
      baseUrl: 'https://evolution.example',
      instance: 'nodika',
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'boom' }),
    });

    await expect(
      new EvolutionClient(locales).sendInteractive(
        '5491112345678',
        { text: 'x', widgets: [] },
        'x',
      ),
    ).rejects.toThrow('WhatsApp provider rejected the message (status 500).');
  });
});
