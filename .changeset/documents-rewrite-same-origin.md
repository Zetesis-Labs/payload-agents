---
"@zetesis/payload-documents": patch
---

Fix Parse endpoint when `doc.url` is absolute with a host that differs from
the loopback (browser-facing `serverURL`).

0.2.1 only rewrote **relative** URLs to `http://localhost:${PORT}`, but
Payload prefixes `serverURL` to every upload URL when it's configured, so
`doc.url` is virtually always absolute — e.g.
`https://nexus.localhost/api/documents/file/foo.pdf` under docker-compose,
or the public ingress host inside a Kubernetes pod. The plugin still
fetched that absolute URL as-is and failed with `fetch failed`
(ENOTFOUND / ECONNREFUSED) because the browser-facing host doesn't resolve
from inside the server container.

`fetchUploadedFile` now compares `doc.url`'s origin against
`req.payload.config.serverURL`:

- **Same origin** (relative URL, or absolute with the same host as
  `serverURL`) → rewrite to `http://localhost:${PORT}${pathname}${search}`.
  Same-process loopback = always reachable.
- **Different origin** (e.g. direct S3/R2/MinIO links when a storage
  adapter is configured with `disablePayloadAccessControl: true`) →
  fetched as-is. No change to that path.

No configuration change required — the correct behaviour is inferred from
the existing `serverURL`.
