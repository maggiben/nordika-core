# Design: JWT source upload authorization

Use Passport's JWT strategy to read Bearer tokens and verify HS256 signatures
with `JWT_SECRET`. The strategy returns a typed principal containing `sub` and
`roles`.

Apply a route-level JWT guard before a role guard on `POST /sources`. The role
guard reads route metadata and permits only a principal whose `roles` array
contains `source_writer`.

If `JWT_SECRET` is not configured, the strategy rejects every token. This fails
closed without adding an application token-issuance endpoint. Deployments must
configure a strong secret shared with the external issuer.
