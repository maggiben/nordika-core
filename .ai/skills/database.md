# Database Skill

Use MongoDB through Mongoose only when `MONGO_URI` or `MONGO_URL` is configured. Keep database access in a domain service, define schemas explicitly, validate data before persistence, and return DTOs rather than Mongoose documents from controllers.

Test persistence behavior with unit-test doubles unless an integration database is explicitly in scope. Do not log connection strings or store secrets in fixtures.
