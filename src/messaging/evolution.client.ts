import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  InteractiveTemplateBody,
  TemplateWidget,
} from './messaging.schema';
import { getEvolutionConfig } from '../config/environment';
import { LocaleService } from '../i18n/locale.service';
import { normalizeLanguage } from '../i18n/languages';
import { renderTemplateText } from './template.renderer';

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
  private readonly config: EvolutionConfig | null;

  constructor(private readonly locales: LocaleService) {
    this.config = getEvolutionConfig();
  }

  isConfigured(): boolean {
    return this.config !== null;
  }

  async sendInteractive(
    phone: string,
    body: InteractiveTemplateBody,
    renderedText: string,
    language?: string,
  ): Promise<SendResult> {
    if (!this.config) {
      throw new ServiceUnavailableException(
        'WhatsApp delivery is not configured.',
      );
    }

    const lang = normalizeLanguage(language);
    const prompts = this.locales.getPrompts(lang);

    const buttons = body.widgets.filter(
      (widget): widget is Extract<TemplateWidget, { type: 'button' }> =>
        widget.type === 'button',
    );
    const inputs = body.widgets.filter((widget) => widget.type === 'input');
    const checkboxes = body.widgets.filter(
      (widget) => widget.type === 'checkbox',
    );

    // Baileys-backed Evolution (v2.3.x) wraps sendButtons in viewOnceMessage,
    // which many WhatsApp clients show as "Unknown message type: viewOnceMessage".
    // Flatten all widgets into a plain text message instead.
    let text = renderedText;
    if (body.title?.trim()) {
      text = `*${body.title.trim()}*\n\n${text}`;
    }
    for (const button of buttons) {
      text += `\n\n🔘 ${button.label}`;
      text += `\n${renderTemplateText(
        prompts.buttonReply ?? 'Reply "{{id}}" for "{{label}}".',
        {
          id: button.id,
          label: button.label,
        },
      )}`;
    }
    for (const input of inputs) {
      text += `\n\n✏️ ${input.label}`;
      if (input.placeholder) {
        text += ` (${input.placeholder})`;
      }
      text += `\n${renderTemplateText(prompts.inputReply, { id: input.id })}`;
    }
    for (const checkbox of checkboxes) {
      text += `\n\n☑️ ${checkbox.label}`;
      for (const option of checkbox.options) {
        text += `\n- ${renderTemplateText(prompts.checkboxOption, {
          id: option.id,
          label: option.label,
        })}`;
      }
    }
    if (body.footer?.trim()) {
      text += `\n\n_${body.footer.trim()}_`;
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
      throw new ServiceUnavailableException(
        'WhatsApp delivery is not configured.',
      );
    }

    const url = `${this.config.baseUrl.replace(/\/$/, '')}${path}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          apikey: this.config.apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'unknown network error';
      this.logger.error(`Evolution send failed for ${path}: ${detail}`);
      throw new BadGatewayException(
        'WhatsApp provider could not be reached. Check Evolution API connectivity.',
      );
    }

    const raw: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      this.logger.error(
        `Evolution send failed (${response.status}) for ${path}`,
      );
      throw new BadGatewayException(
        `WhatsApp provider rejected the message (status ${response.status}).`,
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
