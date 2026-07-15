# Important Services

`AppService` is the only current injectable provider. `getHello()` returns the literal `Hello World!` consumed by `AppController.getHello()`.

`MongoModule` is an infrastructure module, not a domain service. It conditionally opens a Mongoose connection using `MONGO_URI` or Railway `MONGO_URL`; no schemas or models are registered yet.

No queues, caches, third-party clients, or background services are registered. Treat those as new architectural boundaries requiring a module, configuration, test strategy, and dependency justification.
