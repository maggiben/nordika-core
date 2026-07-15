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
      json: () => Promise.resolve({ key: { id: 'msg-1' } }),
    });
    global.fetch = fetchMock;

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
          {
            type: 'input',
            id: 'comment',
            label: 'Comentario',
            placeholder: '...',
          },
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
      json: () => Promise.resolve({}),
    });
    global.fetch = fetchMock;

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
        widgets: [
          { type: 'button', id: 'ack', label: 'Recibido' },
          {
            type: 'button',
            id: 'site',
            label: 'Sitio',
            action: 'url',
            url: 'https://nodika.example',
          },
          {
            type: 'button',
            id: 'call',
            label: 'Llamar',
            action: 'call',
            phoneNumber: '5491112345678',
          },
        ],
      },
      '30%',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://evolution.example/message/sendButtons/nodika',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('tolerates invalid JSON bodies from Evolution', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new Error('bad json')),
    });

    const client = new EvolutionClient({
      apiKey: 'key',
      baseUrl: 'https://evolution.example',
      instance: 'nodika',
    });

    await expect(
      client.sendInteractive('5491112345678', { text: 'x', widgets: [] }, 'x'),
    ).resolves.toEqual({ providerMessageId: undefined, raw: undefined });
  });

  it('throws when Evolution returns a non-OK status', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'boom' }),
    });

    const client = new EvolutionClient({
      apiKey: 'key',
      baseUrl: 'https://evolution.example',
      instance: 'nodika',
    });

    await expect(
      client.sendInteractive('5491112345678', { text: 'x', widgets: [] }, 'x'),
    ).rejects.toThrow('Evolution API request failed with status 500.');
  });
});
