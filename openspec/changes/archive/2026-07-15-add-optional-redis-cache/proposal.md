# Proposal: Add optional Redis cache infrastructure

## Why

The API needs a shared cache for future high-traffic read endpoints without
introducing caching for static or write-only current routes.

## What Changes

- Add a Redis-backed global cache when `REDIS_URL` is configured.
- Disable cache registration when Redis configuration is absent.
- Validate Redis URL protocols and document Railway/local configuration.

## Non-goals

- Caching existing endpoints.
- Adding distributed invalidation or cache-aside logic before a read endpoint
  needs it.
