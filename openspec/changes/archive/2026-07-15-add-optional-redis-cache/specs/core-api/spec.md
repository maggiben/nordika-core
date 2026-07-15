# Delta for Core API

## ADDED Requirements

### Requirement: Optional Redis cache

The service SHALL register a global Redis-backed cache when `REDIS_URL` is
configured with the `redis://` or `rediss://` protocol. It SHALL not register a
cache when the variable is absent.

#### Scenario: Redis caching enabled

- **GIVEN** `REDIS_URL` contains a supported Redis URL
- **WHEN** the service starts
- **THEN** the global cache uses Redis storage

#### Scenario: Redis caching disabled

- **GIVEN** `REDIS_URL` is unset
- **WHEN** the service starts
- **THEN** no cache provider is registered
