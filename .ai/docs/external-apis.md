# External APIs

No external APIs are configured or invoked by the application. The only exposed API is local HTTP `GET /`, which responds with `Hello World!`.

When adding an external integration, document its base URL/configuration, timeout, retry policy, authentication material, error mapping, rate limits, data classification, test double, and ownership. Do not place raw client calls in controllers.
