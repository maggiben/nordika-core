import type { AppLanguage } from './languages';
import type { InteractiveTemplateBody } from '../messaging/messaging.schema';

type EmbeddedCatalog = {
  templates: Record<
    string,
    {
      name: string;
      description?: string;
      title?: string;
      text: string;
      footer?: string;
      widgets: InteractiveTemplateBody['widgets'];
    }
  >;
  prompts: {
    inputReply: string;
    checkboxOption: string;
    buttonReply?: string;
  };
};

/**
 * Built-in WhatsApp copy so production boots even when `locales/whatsapp`
 * is missing from the image (e.g. uncommitted files / GitHub-only deploys).
 * Prefer editing `locales/whatsapp/{es,en}.json` when those files are present.
 */
export const EMBEDDED_WHATSAPP_CATALOGS: Record<AppLanguage, EmbeddedCatalog> =
  {
    es: {
      templates: {
        weekly_status: {
          name: 'Consulta semanal de avance',
          description:
            'Mensaje semanal para consultar porcentaje, duración y avance.',
          title: '{{ciclo_name}}',
          text: 'Ciclo {{ciclo_inicio}} → {{ciclo_fin}}\nSemana {{week}}: {{percent}}%\nDuración: {{duration}}\nAvance: {{avance}}\nNotas: {{notes}}',
          footer: 'Nodika',
          widgets: [
            { type: 'button', id: 'ack', label: 'Recibido' },
            {
              type: 'input',
              id: 'comentario',
              label: 'Comentario',
              placeholder: 'Opcional',
            },
            {
              type: 'checkbox',
              id: 'bloqueos',
              label: '¿Hay bloqueos?',
              options: [
                { id: 'si', label: 'Sí' },
                { id: 'no', label: 'No' },
              ],
            },
          ],
        },
      },
      prompts: {
        inputReply: 'Responde con el texto para "{{id}}".',
        checkboxOption: '{{label}} → responde "{{id}}"',
        buttonReply: 'Responde "{{id}}" para "{{label}}".',
      },
    },
    en: {
      templates: {
        weekly_status: {
          name: 'Weekly progress check-in',
          description:
            'Weekly message to ask for percent complete, duration, and progress.',
          title: '{{ciclo_name}}',
          text: 'Cycle {{ciclo_inicio}} → {{ciclo_fin}}\nWeek {{week}}: {{percent}}%\nDuration: {{duration}}\nProgress: {{avance}}\nNotes: {{notes}}',
          footer: 'Nodika',
          widgets: [
            { type: 'button', id: 'ack', label: 'Received' },
            {
              type: 'input',
              id: 'comentario',
              label: 'Comment',
              placeholder: 'Optional',
            },
            {
              type: 'checkbox',
              id: 'bloqueos',
              label: 'Any blockers?',
              options: [
                { id: 'si', label: 'Yes' },
                { id: 'no', label: 'No' },
              ],
            },
          ],
        },
      },
      prompts: {
        inputReply: 'Reply with text for "{{id}}".',
        checkboxOption: '{{label}} → reply "{{id}}"',
        buttonReply: 'Reply "{{id}}" for "{{label}}".',
      },
    },
  };
