## MODIFIED Requirements

### Requirement: Optional Redis cache

The service SHALL register a global Redis-backed cache when `REDIS_URL` is
configured with the `redis://` or `rediss://` protocol. It SHALL not register a
cache when the variable is absent.

Read-heavy GET endpoints SHALL use Redis caching when available:

- `GET /` (1 hour TTL)
- `GET /messaging/contacts`, `GET /messaging/templates` (5 minute TTL)

Writes to messaging resources SHALL invalidate the corresponding cached GET
responses.

#### Scenario: Redis caching enabled

- **GIVEN** `REDIS_URL` contains a supported Redis URL
- **WHEN** the service starts
- **THEN** the global cache uses Redis storage

#### Scenario: Redis caching disabled

- **GIVEN** `REDIS_URL` is unset
- **WHEN** the service starts
- **THEN** no cache provider is registered

#### Scenario: Cached GET response

- **GIVEN** Redis caching is enabled
- **WHEN** a client repeats the same GET request before the TTL expires
- **THEN** the service serves the cached response without re-querying MongoDB

#### Scenario: Cache invalidation on write

- **GIVEN** a cached `GET /messaging/contacts` response exists
- **WHEN** a `message_admin` creates or updates a contact
- **THEN** the contacts cache entry is removed
