import { existsSync, readFileSync } from 'fs';
import { LocaleService } from './locale.service';

jest.mock('fs', () => {
  const actual = jest.requireActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: jest.fn(actual.existsSync),
    readFileSync: jest.fn(actual.readFileSync),
    readdirSync: jest.fn(actual.readdirSync),
  };
});

describe('LocaleService', () => {
  const mockedExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
  const mockedReadFileSync = readFileSync as jest.MockedFunction<
    typeof readFileSync
  >;

  afterEach(() => {
    mockedExistsSync.mockImplementation(
      jest.requireActual<typeof import('fs')>('fs').existsSync,
    );
    mockedReadFileSync.mockImplementation(
      jest.requireActual<typeof import('fs')>('fs').readFileSync,
    );
  });

  it('lists supported languages and template catalogs', () => {
    const locales = new LocaleService();
    expect(locales.listLanguages()).toEqual(
      expect.arrayContaining(['es', 'en']),
    );
    const templates = locales.listTemplates('es');
    expect(templates.length).toBeGreaterThan(0);
    const first = templates[0];
    expect(first).toBeDefined();
    if (!first) {
      return;
    }
    expect(typeof first.key).toBe('string');
    expect(first.language).toBe('es');
    const body = locales.toInteractiveBody(first);
    expect(typeof body.text).toBe('string');
    expect(Array.isArray(body.widgets)).toBe(true);
  });

  it('resolves templates and prompts with language fallback', () => {
    const locales = new LocaleService();
    const template = locales.getTemplate('weekly_status', 'es');
    expect(template?.text).toBeTruthy();
    expect(locales.getTemplate('missing_key', 'es')).toBeUndefined();
    expect(locales.getPrompts('en').inputReply).toBeTruthy();
    expect(locales.getPrompts('fr').inputReply).toBeTruthy();
  });

  it('falls back to embedded catalogs when locale files are missing', () => {
    mockedExistsSync.mockReturnValue(false);
    const locales = new LocaleService();
    expect(locales.getTemplate('weekly_status', 'es')?.text).toBeTruthy();
    expect(locales.getPrompts('es').inputReply).toBeTruthy();
  });

  it('falls back to embedded catalogs when locale files are invalid', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('{"broken":true}');
    const locales = new LocaleService();
    expect(locales.getTemplate('weekly_status', 'en')?.text).toBeTruthy();
  });
});
