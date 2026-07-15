# NestJS HTTP API Skill

## Purpose
Extend the `nodika-core` NestJS API without bypassing its module, controller, and service boundaries.

## Responsibilities
- Put route decorators and HTTP translation in controllers.
- Put use-case/business behavior in injectable services.
- Register each new controller/provider/module through Nest metadata.
- Define explicit request DTOs and response types before an endpoint has inputs.

## Inputs
A feature requirement, its route/method, request contract, response contract, and failure cases.

## Outputs
A feature module or additions to `src/app.module.ts`, typed controller and service code, plus unit and e2e coverage.

## Best practices
- Follow the existing constructor injection pattern in `src/app.controller.ts`.
- Start a new domain in `src/<domain>/` with `<domain>.module.ts`, `<domain>.controller.ts`, and `<domain>.service.ts`; keep `AppModule` as composition root.
- Use Nest exceptions (`BadRequestException`, `NotFoundException`, etc.) at the HTTP boundary.
- Add DTO validation only together with a globally configured validation pipe; none exists in `src/main.ts` today.
- Keep `main.ts` bootstrap explicit: `void bootstrap()` intentionally marks startup as unawaited.

## Common mistakes
- Returning persistence/third-party objects directly from controllers.
- Adding domain behavior to `AppController` or `AppService`, which currently implement only the starter root endpoint.
- Adding a decorator or DTO without registering its module/provider.
- Assuming global validation, CORS, versioning, Swagger, or exception filters exist; they do not.

## Code example
```ts
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  getHealth(): { status: 'ok' } {
    return this.healthService.getHealth();
  }
}
```

## Related files
- `src/main.ts`
- `src/app.module.ts`
- `src/app.controller.ts`
- `src/app.service.ts`
- `package.json`
