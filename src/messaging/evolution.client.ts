import { Injectable, Logger } from '@nestjs/common';
import type { InteractiveTemplateBody, TemplateWidget } from './messaging.schema';

export interface EvolutionConfig {
  apiKey: string;
  baseUrl: string;
  instance: string;
}

export interface SendResult {
  providerMessageId?: string;
  raw?: unknown;
}

@Injectable()
export class EvolutionClient {
  private readonly logger = new Logger(EvolutionClient.name);

  constructor(private readonly config: EvolutionConfig | null) {}

  isConfigured(): boolean {
    return this.config !== null;
  }

  async sendInteractive(
    phone: string,
    body: InteractiveTemplateBody,
    renderedText: string,
  ): Promise<SendResult> {
    if (!this.config) {
      throw new Error('Evolution API is not configured.');
    }

    const buttons = body.widgets.filter(
      (widget): widget is Extract<TemplateWidget, { type: 'button' }> =>
        widget.type === 'button',
    );
    const inputs = body.widgets.filter((widget) => widget.type === 'input');
    const checkboxes = body.widgets.filter(
      (widget) => widget.type === 'checkbox',
    );

    let text = renderedText;
    for (const input of inputs) {
      text += `\n\n✏️ ${input.label}`;
      if (input.placeholder) {
        text += ` (${input.placeholder})`;
      }
      text += `\nResponde con el texto para "${input.id}".`;
    }
    for (const checkbox of checkboxes) {
      text += `\n\n☑️ ${checkbox.label}`;
      for (const option of checkbox.options) {
        text += `\n- ${option.label} → responde "${option.id}"`;
      }
    }

    if (buttons.length > 0) {
      return this.post(`/message/sendButtons/${this.config.instance}`, {
        number: phone,
        title: body.title ?? 'Nodika',
        description: text,
        footer: body.footer ?? '',
        buttons: buttons.map((button) => ({
          type: button.action ?? 'reply',
          displayText: button.label,
          id: button.id,
          ...(button.url ? { url: button.url } : {}),
          ...(button.phoneNumber ? { phoneNumber: button.phoneNumber } : {}),
        })),
      });
    }

    return this.post(`/message/sendText/${this.config.instance}`, {
      number: phone,
      text,
    });
  }

  private async post(
    path: string,
    payload: Record<string, unknown>,
  ): Promise<SendResult> {
    if (!this.config) {
      throw new Error('Evolution API is not configured.');
    }

    const url = `${this.config.baseUrl.replace(/\/$/, '')}${path}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: this.config.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const raw: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      this.logger.error(
        `Evolution send failed (${response.status}) for ${path}`,
      );
      throw new Error(
        `Evolution API request failed with status ${response.status}.`,
      );
    }

    const providerMessageId =
      typeof raw === 'object' &&
      raw !== null &&
      'key' in raw &&
      typeof (raw as { key?: { id?: unknown } }).key?.id === 'string'
        ? (raw as { key: { id: string } }).key.id
        : undefined;

    return { providerMessageId, raw };
  }
}
