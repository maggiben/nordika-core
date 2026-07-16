/**
 * Live smoke test for ProgressParseService against Railway/local env keys.
 * Usage: railway run -- npx ts-node --transpile-only scripts/smoke-progress-parse.ts
 */
import { ProgressParseService } from '../src/messaging/progress-parse.service';
import { getOpenAIConfig, getAnthropicConfig } from '../src/config/environment';

const samples = [
  {
    name: 'simple percent',
    replyBody: 'Hola, vamos al 40% del hormigón, faltan dos días',
    taskLabel: 'Hormigón losa',
    outboundBody: '¿Cómo va el avance del hormigón?',
  },
  {
    name: 'roles',
    replyBody:
      'El jefe de obra dice 70%, los operarios 50% y los jornaleros tipo 30%. Pintura casi lista.',
    taskLabel: 'Pintura interiores',
    outboundBody: '¿Cómo va la pintura?',
  },
  {
    name: 'vague',
    replyBody: 'Todavía no arrancamos, estamos esperando materiales',
    taskLabel: 'Instalación eléctrica',
    outboundBody: '¿Cómo va la eléctrica?',
  },
];

async function main() {
  const openAi = getOpenAIConfig();
  const anthropic = getAnthropicConfig();
  console.log(
    JSON.stringify(
      {
        openaiConfigured: Boolean(openAi),
        openaiModel: openAi?.progressModel ?? null,
        anthropicConfigured: Boolean(anthropic),
        anthropicModel: anthropic?.progressModel ?? null,
      },
      null,
      2,
    ),
  );

  if (!openAi && !anthropic) {
    console.error('No OPENAI_API_KEY or ANTHROPIC_API_KEY in env — aborting.');
    process.exit(1);
  }

  const service = new ProgressParseService();

  for (const sample of samples) {
    process.stdout.write(`\n=== ${sample.name} ===\n`);
    process.stdout.write(`reply: ${sample.replyBody}\n`);
    const result = await service.parseReply({
      replyBody: sample.replyBody,
      taskLabel: sample.taskLabel,
      outboundBody: sample.outboundBody,
      progressAi: openAi
        ? { provider: 'openai', model: openAi.progressModel }
        : { provider: 'anthropic', model: anthropic!.progressModel },
    });
    console.log(JSON.stringify(result, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
