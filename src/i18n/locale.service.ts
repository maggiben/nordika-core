import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type { InteractiveTemplateBody } from '../messaging/messaging.schema';
import {
  AppLanguage,
  DEFAULT_LANGUAGE,
  normalizeLanguage,
  SUPPORTED_LANGUAGES,
} from './languages';
import { EMBEDDED_WHATSAPP_CATALOGS } from './whatsapp-catalogs';

export interface LocaleTemplateDefinition {
  name: string;
  description?: string;
  title?: string;
  text: string;
  footer?: string;
  widgets: InteractiveTemplateBody['widgets'];
}

export interface LocaleCatalog {
  templates: Record<string, LocaleTemplateDefinition>;
  prompts: {
    inputReply: string;
    checkboxOption: string;
    /** Baileys cannot reliably deliver native buttons; we render these as text. */
    buttonReply?: string;
  };
}

@Injectable()
export class LocaleService {
  private readonly logger = new Logger(LocaleService.name);
  private readonly catalogs = new Map<AppLanguage, LocaleCatalog>();

  constructor() {
    for (const language of SUPPORTED_LANGUAGES) {
      this.catalogs.set(language, this.loadCatalog(language));
    }
  }

  listLanguages(): AppLanguage[] {
    return [...SUPPORTED_LANGUAGES];
  }

  getTemplate(
    key: string,
    language: string | undefined,
  ): LocaleTemplateDefinition | undefined {
    const lang = normalizeLanguage(language);
    return (
      this.catalogs.get(lang)?.templates[key] ??
      this.catalogs.get(DEFAULT_LANGUAGE)?.templates[key]
    );
  }

  listTemplates(
    language: string | undefined,
  ): Array<LocaleTemplateDefinition & { key: string; language: AppLanguage }> {
    const lang = normalizeLanguage(language);
    const catalog =
      this.catalogs.get(lang) ?? this.catalogs.get(DEFAULT_LANGUAGE);
    if (!catalog) {
      return [];
    }

    return Object.entries(catalog.templates).map(([key, template]) => ({
      key,
      language: lang,
      ...template,
    }));
  }

  getPrompts(language: string | undefined): LocaleCatalog['prompts'] {
    const lang = normalizeLanguage(language);
    return (
      this.catalogs.get(lang)?.prompts ??
      this.catalogs.get(DEFAULT_LANGUAGE)!.prompts
    );
  }

  toInteractiveBody(
    template: LocaleTemplateDefinition,
  ): InteractiveTemplateBody {
    return {
      text: template.text,
      title: template.title,
      footer: template.footer,
      widgets: template.widgets,
    };
  }

  private loadCatalog(language: AppLanguage): LocaleCatalog {
    const path = this.resolveLocalePath(language);
    if (!path) {
      this.logger.warn(
        `WhatsApp locale file for "${language}" not found on disk; using embedded catalog.`,
      );
      return EMBEDDED_WHATSAPP_CATALOGS[language];
    }

    try {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as LocaleCatalog;
      if (!raw.templates || !raw.prompts) {
        throw new Error('Locale file must include templates and prompts.');
      }
      this.logger.log(`Loaded WhatsApp locale ${language} from ${path}`);
      return raw;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown locale load error';
      this.logger.error(
        `Failed to load WhatsApp locale ${language} from ${path}: ${message}. Using embedded catalog.`,
      );
      return EMBEDDED_WHATSAPP_CATALOGS[language];
    }
  }

  private resolveLocalePath(language: AppLanguage): string | null {
    const candidates = [
      join(process.cwd(), 'locales', 'whatsapp', `${language}.json`),
      join(__dirname, '..', '..', 'locales', 'whatsapp', `${language}.json`),
      join(
        __dirname,
        '..',
        '..',
        '..',
        'locales',
        'whatsapp',
        `${language}.json`,
      ),
      // When nest copies assets next to compiled i18n output.
      join(__dirname, 'catalogs', `${language}.json`),
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    const dir = join(process.cwd(), 'locales', 'whatsapp');
    const available = existsSync(dir) ? readdirSync(dir).join(', ') : 'none';
    this.logger.warn(
      `No locale file for ${language}. Looked in ${candidates.join(
        ' | ',
      )}. Available in cwd: ${available}`,
    );
    return null;
  }
}
