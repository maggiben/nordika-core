# File Upload Review Harness

## Goal
Review a proposed or implemented upload flow before files are accepted from clients.

## Steps
1. Trace multipart handling from route to temporary storage, scanning, final storage, retrieval, and deletion.
2. Verify authorization before upload and before download/delete.
3. Enforce allowlisted MIME types/extensions, byte limits, content inspection where needed, randomized names, and safe storage outside executable/static paths.
4. Verify files are not trusted based on client metadata and are not rendered inline without safe handling.
5. Define malware scanning/quarantine, retention, audit, and failure behavior before production use.

## Expected output
An upload threat model, control gaps, and tested remediation plan.

## Validation
Use harmless synthetic files covering allowed, oversized, mismatched-type, malformed, and unauthorized cases. Never upload malicious payloads outside an explicitly authorized test environment.

## Rollback strategy
Disable the upload route or quarantine new files if a serious control fails; do not expose temporary storage publicly.

## Checklist
- [ ] Type, size, content, storage, and ownership are validated
- [ ] File names are not trusted
- [ ] Temporary and final storage are not publicly executable
- [ ] Downloads enforce authorization and safe headers
- [ ] Failure paths clean up temporary files
