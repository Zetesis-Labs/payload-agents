---
"@zetesis/payload-documents": patch
---

Fix Parse endpoint self-fetch so it works regardless of the public server
URL.

`fetchUploadedFile` used to build the file URL by concatenating
`req.payload.config.serverURL` with the document's relative URL. That
`serverURL` is the browser-facing URL (admin panel, email links, etc.) and
is usually unreachable from inside the server container itself —
`https://nexus.localhost` under docker-compose, or the public ingress host
inside a Kubernetes pod — which caused the Parse button to fail with an
ECONNREFUSED wrapped in a 502.

The upload is served by Payload's own HTTP handler in the same Node
process, so the fetch is now directed at `http://localhost:${PORT}`
(defaulting to 3000). Same-process → always reachable, no dependency on
`serverURL` or any other deploy-specific hostname. Absolute URLs returned
by storage adapters (public S3/R2/MinIO buckets) continue to be fetched
directly as before.
