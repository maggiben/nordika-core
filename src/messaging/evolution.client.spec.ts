import { EvolutionClient } from './evolution.client';

describe('EvolutionClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('reports when it is not configured', () => {
    expect(new EvolutionClient(null).isConfigured()).toBe(false);
  });

  it('throws when sending without configuration', async () => {
    await expect(
      new EvolutionClient(null).sendInteractive(
        '5491112345678',
        { text: 'x', widgets: [] },
        'x',
      ),
    ).rejects.toThrow('Evolution API is not configured.');
  });

  it('sends text when there are no buttons', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ key: { id: 'msg-1' } }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new EvolutionClient({
      apiKey: 'key',
      baseUrl: 'https://evolution.example',
      instance: 'nodika',
    });

    const result = await client.sendInteractive(
      '5491112345678',
      {
        text: 'hello',
        widgets: [
          { type: 'input', id: 'comment', label: 'Comentario' },
          {
            type: 'checkbox',
            id: 'ok',
            label: 'OK?',
            options: [{ id: 'yes', label: 'Sí' }],
          },
        ],
      },
      'hello',
    );

    expect(result.providerMessageId).toBe('msg-1');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://evolution.example/message/sendText/nodika',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('sends buttons when button widgets are present', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new EvolutionClient({
      apiKey: 'key',
      baseUrl: 'https://evolution.example/',
      instance: 'nodika',
    });

    await client.sendInteractive(
      '5491112345678',
      {
        title: 'Status',
        text: '30%',
        footer: 'Nodika',
        widgets: [{ type: 'button', id: 'ack', label: 'Recibido' }],
      },
      '30%',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://evolution.example/message/sendButtons/nodika',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws when Evolution returns a non-OK status', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'boom' }),
    }) as unknown as typeof fetch;

    const client = new EvolutionClient({
      apiKey: 'key',
      baseUrl: 'https://evolution.example',
      instance: 'nodika',
    });

    await expect(
      client.sendInteractive(
        '5491112345678',
        { text: 'x', widgets: [] },
        'x',
      ),
    ).rejects.toThrow('Evolution API request failed with status 500.');
  });
});
