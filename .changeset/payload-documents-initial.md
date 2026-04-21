---
'@zetesis/payload-documents': minor
---

Add new `@zetesis/payload-documents` package: a Payload CMS plugin that registers an upload-enabled `documents` collection and wires a LlamaParse (LlamaIndex Cloud) flow to parse uploaded PDFs into editable markdown.

The plugin is configuration-driven — parsing parameters (`language`, `mode`, `parsing_instruction`) live on the document itself so each upload can be tuned independently. `result_type` is fixed to markdown so downstream consumers get a stable shape.

- **Admin UX**: a `ParseButtonField` (client boundary at `@zetesis/payload-documents/client`) posts to the plugin's REST endpoints and polls until the job settles, then reloads so the parsed markdown appears in the document.
- **Endpoints**: `POST /api/{slug}/:id/parse` kicks off a job and stores `parse_job_id`; `GET /api/{slug}/:id/parse-status` polls LlamaParse and writes the resulting markdown into a `parsed_text` code field when `SUCCESS`.
- **Multitenancy & storage** are intentionally not hardcoded — host apps add the collection slug to their existing `@payloadcms/plugin-multi-tenant` and `@payloadcms/storage-s3` configurations.

```ts
import { createDocumentsPlugin } from '@zetesis/payload-documents'

export default buildConfig({
  plugins: [createDocumentsPlugin().plugin]
})
```
