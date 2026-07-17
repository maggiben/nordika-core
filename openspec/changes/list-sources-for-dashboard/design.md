## Context

POST /sources already persists SourceOfTruth with optional projectId from meta.projectId. Frontend needs an authenticated list for the dashboard.

## Decisions

1. GET /sources behind JwtAuthGuard + source_writer role (same as upload).
2. Response: array of { id, projectId, name, filename, createdAt, content } — newest doc per projectId.
3. name from meta.projectNombre with fallback to projectId.
4. Documents missing projectId are omitted.

## Risks

- Payload size bounded by existing 5 MiB upload limit per project latest.
