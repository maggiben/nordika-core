import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { getAnthropicConfig, getOpenAIConfig } from '../config/environment';
import type { ProgressAiSettings } from '../account/progress-ai';

export interface ProgressParseInput {
  replyBody: string;
  taskId?: string;
  taskLabel?: string;
  outboundBody?: string;
  /** Account preference; unset → OpenAI path (legacy default). */
  progressAi?: ProgressAiSettings | null;
}

export interface ProgressByRole {
  jefe_obra?: number;
  operario?: number;
  jornalero?: number;
  otro?: number;
}

export interface ParsedProgressResult {
  percent: number;
  duration?: string;
  avance?: string;
  notes?: string;
  byRole?: ProgressByRole;
  model?: string;
}

const ROLE_KEYS = ['jefe_obra', 'operario', 'jornalero', 'otro'] as const;

export const PROGRESS_PARSE_SYSTEM_PROMPT = `Eres un extractor de avance de obra para Nodika.
Recibes respuestas de WhatsApp en español (texto libre) a preguntas de avance de tarea o catálogo.
Devuelve SOLO JSON válido con esta forma:
{
  "percent": number (0-100, avance general reportado),
  "duration": string opcional (tiempo / duración mencionada),
  "avance": string opcional (resumen corto del avance),
  "notes": string opcional (observaciones),
  "byRole": objeto opcional con porcentajes 0-100 por rol:
    "jefe_obra", "operario", "jornalero", "otro"
}
Si no hay un porcentaje claro, estima con cuidado a partir del texto; si es imposible, usa 0.
No inventes duración ni roles si no se mencionan.`;

@Injectable()
export class ProgressParseService {
  private readonly logger = new Logger(ProgressParseService.name);
  private readonly openAiClient: OpenAI | null;
  private readonly openAiModel: string;
  private readonly anthropicApiKey: string | null;
  private readonly anthropicModel: string;
  private anthropicFetch: typeof fetch = fetch;

  constructor() {
    const openAi = getOpenAIConfig();
    if (!openAi) {
      this.openAiClient = null;
      this.openAiModel = 'gpt-4o-mini';
    } else {
      this.openAiClient = new OpenAI({ apiKey: openAi.apiKey });
      this.openAiModel = openAi.progressModel;
    }

    const anthropic = getAnthropicConfig();
    this.anthropicApiKey = anthropic?.apiKey ?? null;
    this.anthropicModel = anthropic?.progressModel ?? 'claude-sonnet-4-5';
  }

  /** @internal test seam */
  setAnthropicFetchForTests(impl: typeof fetch): void {
    this.anthropicFetch = impl;
  }

  async parseReply(
    input: ProgressParseInput,
  ): Promise<ParsedProgressResult | null> {
    const replyBody = input.replyBody?.trim() ?? '';
    if (!replyBody) {
      return null;
    }

    const provider = input.progressAi?.provider ?? 'openai';
    const modelOverride = input.progressAi?.model?.trim();

    if (provider === 'anthropic') {
      return this.parseWithAnthropic(input, replyBody, modelOverride);
    }
    return this.parseWithOpenAI(input, replyBody, modelOverride);
  }

  private buildUserContent(
    input: ProgressParseInput,
    replyBody: string,
  ): string {
    const contextParts = [
      input.taskId ? `taskId: ${input.taskId}` : null,
      input.taskLabel ? `taskLabel: ${input.taskLabel}` : null,
      input.outboundBody ? `pregunta: ${input.outboundBody}` : null,
      `respuesta: ${replyBody}`,
    ].filter(Boolean);
    return contextParts.join('\n');
  }

  private async parseWithOpenAI(
    input: ProgressParseInput,
    replyBody: string,
    modelOverride?: string,
  ): Promise<ParsedProgressResult | null> {
    if (!this.openAiClient) {
      return null;
    }

    const model = modelOverride || this.openAiModel;

    try {
      const completion = await this.openAiClient.chat.completions.create({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: PROGRESS_PARSE_SYSTEM_PROMPT },
          { role: 'user', content: this.buildUserContent(input, replyBody) },
        ],
      });

      const content = completion.choices[0]?.message?.content?.trim();
      if (!content) {
        this.logger.warn('OpenAI progress parse returned empty content');
        return null;
      }

      const parsed = this.normalizeParsed(JSON.parse(content) as unknown);
      if (!parsed) {
        return null;
      }
      return {
        ...parsed,
        model: completion.model || model,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown OpenAI error';
      this.logger.warn(`OpenAI progress parse failed: ${message}`);
      return null;
    }
  }

  private async parseWithAnthropic(
    input: ProgressParseInput,
    replyBody: string,
    modelOverride?: string,
  ): Promise<ParsedProgressResult | null> {
    if (!this.anthropicApiKey) {
      this.logger.warn(
        'Anthropic progress parse skipped: ANTHROPIC_API_KEY is not configured',
      );
      return null;
    }

    const model = modelOverride || this.anthropicModel;

    try {
      const response = await this.anthropicFetch(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': this.anthropicApiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: 1024,
            temperature: 0,
            system: PROGRESS_PARSE_SYSTEM_PROMPT,
            messages: [
              {
                role: 'user',
                content: this.buildUserContent(input, replyBody),
              },
            ],
          }),
        },
      );

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        this.logger.warn(
          `Anthropic progress parse failed: HTTP ${response.status}${errorBody ? ` ${errorBody.slice(0, 200)}` : ''}`,
        );
        return null;
      }

      const payload = (await response.json()) as {
        model?: string;
        content?: Array<{ type?: string; text?: string }>;
      };
      const text = payload.content
        ?.filter(
          (block) => block.type === 'text' && typeof block.text === 'string',
        )
        .map((block) => block.text)
        .join('\n')
        .trim();

      if (!text) {
        this.logger.warn('Anthropic progress parse returned empty content');
        return null;
      }

      const jsonText = extractJsonObject(text);
      if (!jsonText) {
        this.logger.warn('Anthropic progress parse returned non-JSON content');
        return null;
      }

      const parsed = this.normalizeParsed(JSON.parse(jsonText) as unknown);
      if (!parsed) {
        return null;
      }
      return {
        ...parsed,
        model: payload.model || model,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown Anthropic error';
      this.logger.warn(`Anthropic progress parse failed: ${message}`);
      return null;
    }
  }

  normalizeParsed(raw: unknown): Omit<ParsedProgressResult, 'model'> | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    const obj = raw as Record<string, unknown>;
    const percent = clampPercent(obj.percent);
    if (percent === null) {
      return null;
    }

    const duration = optionalString(obj.duration);
    const avance = optionalString(obj.avance);
    const notes = optionalString(obj.notes);
    const byRole = normalizeByRole(obj.byRole);

    return {
      percent,
      ...(duration !== undefined ? { duration } : {}),
      ...(avance !== undefined ? { avance } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(byRole !== undefined ? { byRole } : {}),
    };
  }
}

function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  return null;
}

function clampPercent(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeByRole(value: unknown): ProgressByRole | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const source = value as Record<string, unknown>;
  const result: ProgressByRole = {};
  let any = false;
  for (const key of ROLE_KEYS) {
    const clamped = clampPercent(source[key]);
    if (clamped !== null) {
      result[key] = clamped;
      any = true;
    }
  }
  return any ? result : undefined;
}
