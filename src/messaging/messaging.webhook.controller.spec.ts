import { UnauthorizedException } from '@nestjs/common';
import { MessagingWebhookController } from './messaging.webhook.controller';
import { MessagingService } from './messaging.service';

describe('MessagingWebhookController', () => {
  const extractInboundFromEvolution = jest.fn();
  const recordInboundMessage = jest.fn();
  const messaging = {
    extractInboundFromEvolution,
    recordInboundMessage,
  } as unknown as MessagingService;

  const controller = new MessagingWebhookController(messaging);
  const originalSecret = process.env.EVOLUTION_WEBHOOK_SECRET;

  afterEach(() => {
    jest.clearAllMocks();
    if (originalSecret === undefined) {
      delete process.env.EVOLUTION_WEBHOOK_SECRET;
    } else {
      process.env.EVOLUTION_WEBHOOK_SECRET = originalSecret;
    }
  });

  it('ignores unrecognized Evolution payloads', () => {
    delete process.env.EVOLUTION_WEBHOOK_SECRET;
    extractInboundFromEvolution.mockReturnValue(null);
    expect(controller.ingestEvolution({})).toEqual({
      ok: true,
      ignored: true,
    });
  });

  it('records inbound Evolution messages when parsed', () => {
    delete process.env.EVOLUTION_WEBHOOK_SECRET;
    extractInboundFromEvolution.mockReturnValue({
      phone: '5491112345678',
      body: 'hola',
    });
    recordInboundMessage.mockReturnValue({
      ok: true,
      contactId: '1',
      phone: '5491112345678',
    });
    expect(
      controller.ingestEvolution({ data: { from: '5491112345678' } }),
    ).toMatchObject({ ok: true });
    expect(recordInboundMessage).toHaveBeenCalled();
  });

  it('accepts explicit inbound payloads and enforces webhook secret', () => {
    process.env.EVOLUTION_WEBHOOK_SECRET = 'secret';
    recordInboundMessage.mockReturnValue({
      ok: true,
      contactId: '1',
      phone: '5491112345678',
    });

    expect(() =>
      controller.ingestInbound(
        { phone: '5491112345678', body: 'hola' },
        'wrong',
      ),
    ).toThrow(UnauthorizedException);

    expect(
      controller.ingestInbound(
        { phone: '5491112345678', body: 'hola' },
        'secret',
      ),
    ).toMatchObject({ ok: true });
  });
});
