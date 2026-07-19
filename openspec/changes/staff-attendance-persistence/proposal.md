## Why

The frontend attendance sheet currently stores marks in browser `localStorage`. Operators need the same data in MongoDB so history survives devices and matches how org charts already persist on WhatsApp contacts.

## What Changes

- Store attendance marks on each lead’s WhatsApp contact document.
- Expose authenticated GET/PUT messaging endpoints scoped by contact id and optional year-month.
- Keep full history across months; month PUT replaces only that month’s marks.

## Capabilities

### New Capabilities

- `staff-attendance`: Persist and read per-lead attendance marks in Core.

### Modified Capabilities

- (none)

## Impact

- `WhatsAppContact` schema, messaging DTOs/service/controller, tests
- Frontend BFF will proxy these routes (sibling change)
