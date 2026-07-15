# Incident Response Harness

## Steps
1. Stabilize the affected service and preserve evidence without exposing sensitive data.
2. Record impact, timeline, affected versions, and safe reproduction details.
3. Identify the root cause and implement the narrowest verified remediation.
4. Add regression coverage, document follow-up actions, and validate recovery.

## Rules
- Do not delete logs, rewrite history, or rotate credentials without recording the action.
- Communicate only evidence-backed status and do not expose secrets or personal data.
