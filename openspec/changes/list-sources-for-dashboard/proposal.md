## Why

The frontend dashboard still depends on a browser localStorage copy of uploaded snapshots because Core only exposes POST /sources. Operators expect MongoDB SourceOfTruth to be the single source of truth for listing and visualizing obras.

## What Changes

- Add authenticated GET /sources that returns the newest SourceOfTruth per projectId, including metadata and snapshot content.
- Exclude documents without a usable projectId.
- Keep existing POST /sources upload behavior unchanged.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- source-of-truth: authenticated clients can list latest sources per project for dashboard use.

## Impact

- SourcesController / SourcesService
