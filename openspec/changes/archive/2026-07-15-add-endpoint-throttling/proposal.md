# Proposal: Add endpoint throttling

## Why

The service has no request-rate controls, allowing a client to consume
unbounded resources or repeatedly probe protected endpoints.

## What Changes

- Apply a global per-IP limit of 60 requests per minute.
- Limit `POST /sources` to 10 requests per minute.
- Return HTTP 429 when a client exceeds an applicable limit.

## Non-goals

- Distributed throttling storage, user-based quotas, or rate-limit bypasses.
