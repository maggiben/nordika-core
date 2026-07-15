# Important Services

`AppService` returns the literal `Hello World!` consumed by `AppController.getHello()`.

`MongoModule` is an infrastructure module. It conditionally opens a Mongoose connection using `MONGO_URI` or Railway `MONGO_URL`.

`SourcesService` parses validated JSON uploads and persists the source filename, payload, and creation time in MongoDB. It reports an unavailable service when MongoDB is not configured.

No queues, caches, third-party clients, or background services are registered. Treat those as new architectural boundaries requiring a module, configuration, test strategy, and dependency justification.
