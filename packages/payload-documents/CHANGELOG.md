# @zetesis/payload-documents

## 0.2.1

### Patch Changes

- [`afb2fa8`](https://github.com/Zetesis-Labs/PayloadAgents/commit/afb2fa8503b43fc134879e1dd590c150759dce34) - Fix Parse endpoint self-fetch so it works regardless of the public server
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

## 0.2.0

### Minor Changes

- [#24](https://github.com/Zetesis-Labs/PayloadAgents/pull/24) [`15ada08`](https://github.com/Zetesis-Labs/PayloadAgents/commit/15ada08c596056c54396a6208c0d427d0b8cd748) Thanks [@Fiser12](https://github.com/Fiser12)! - Add new `@zetesis/payload-documents` package: a Payload CMS plugin that registers an upload-enabled `documents` collection and wires a LlamaParse (LlamaIndex Cloud) flow to parse uploaded PDFs into editable markdown.

  The plugin is configuration-driven — parsing parameters (`language`, `mode`, `parsing_instruction`) live on the document itself so each upload can be tuned independently. `result_type` is fixed to markdown so downstream consumers get a stable shape.

  - **Admin UX**: a `ParseButtonField` (client boundary at `@zetesis/payload-documents/client`) posts to the plugin's REST endpoints and polls until the job settles, then reloads so the parsed markdown appears in the document.
  - **Endpoints**: `POST /api/{slug}/:id/parse` kicks off a job and stores `parse_job_id`; `GET /api/{slug}/:id/parse-status` polls LlamaParse and writes the resulting markdown into a `parsed_text` code field when `SUCCESS`.
  - **Multitenancy & storage** are intentionally not hardcoded — host apps add the collection slug to their existing `@payloadcms/plugin-multi-tenant` and `@payloadcms/storage-s3` configurations.

  ```ts
  import { createDocumentsPlugin } from "@zetesis/payload-documents";

  export default buildConfig({
    plugins: [createDocumentsPlugin().plugin],
  });
  ```

### Patch Changes

- [#24](https://github.com/Zetesis-Labs/PayloadAgents/pull/24) [`507dac6`](https://github.com/Zetesis-Labs/PayloadAgents/commit/507dac6aac85710adc5790bd82864c362f42b78f) Thanks [@Fiser12](https://github.com/Fiser12)! - Address three issues raised in the Devin review of PR #24:

  - **Treat `CANCELED` LlamaParse jobs as terminal.** `resolveJob` in the parse-status endpoint previously fell through to `handleProcessing` for any status other than `SUCCESS`/`ERROR`, including `CANCELED`. Canceled jobs never transition to `SUCCESS` or `ERROR`, so the document stayed in `processing` and the client polled forever. Canceled jobs now surface as `parse_status='error'` with the message "LlamaParse job was canceled" (overridable by the API's own `error_message`).
  - **Fail-fast when the uploaded file URL cannot be resolved.** `fetchUploadedFile` used to fall back to an empty `serverURL`, which turned a relative upload URL into a path-only string and blew up Node's `fetch` with a cryptic `TypeError: Invalid URL`. It now returns a clear 500 (`"Payload serverURL is not configured and the uploaded file URL is relative"`) when the URL is relative and no `serverURL` is set.
  - **Clean up the polling interval on unmount.** `ParseButtonField` started a `setInterval` via `startPolling` but never cleared it when the component unmounted. If the user navigated away mid-parse, the interval kept firing, called `setState` on an unmounted component, and could trigger `window.location.reload()` after navigation. Added a `useEffect` cleanup that always clears the interval on unmount.

- [#24](https://github.com/Zetesis-Labs/PayloadAgents/pull/24) [`277517f`](https://github.com/Zetesis-Labs/PayloadAgents/commit/277517fe546daa319b3b1a197c40f52b608bc653) Thanks [@Fiser12](https://github.com/Fiser12)! - Make the **Parse with LlamaParse** button always visible in the admin.

  Previously the button was declared as a UI field inside a `Parsing` tab and was conditionally hidden while the document had no `id` (i.e. before the first save). Users could not find the button after uploading a PDF because it only appeared if they remembered to click the `Parsing` tab _after_ saving.

  Now:

  - The `parse_action` UI field is rendered at the top of the form, outside the tabs, so it shows up as soon as the document is opened.
  - The button is always rendered — when the document has not been saved yet, it is disabled with the hint "Upload a PDF and save the document to enable parsing." This makes the flow discoverable without relying on users knowing they need to save first.
  - Status, job id, parsed-at and the error textarea are still on the form but at top-level (status/job/date in the sidebar) so the remaining `tabs` (`Params`, `Output`) only group things that actually belong together.
  - `toast.info` is replaced with `toast.success` for the "Parsing started" notification to avoid a possible runtime mismatch with the subset of toast methods re-exported from `@payloadcms/ui`.

  No config or behavior changes on the server side — only how the admin surfaces the existing flow.
