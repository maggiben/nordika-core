# Design: Endpoint throttling

Use Nest's `@nestjs/throttler` module with its in-memory storage and the
global `ThrottlerGuard`. Track requests by client IP address.

The default policy allows 60 requests in a 60-second window. `POST /sources`
overrides the default to 10 requests in the same window because it parses
uploads and writes data. The in-memory store intentionally scopes limits to
one process; a future multi-instance deployment needs a shared storage adapter.
