---
'@zetesis/payload-documents': patch
---

Make the **Parse with LlamaParse** button always visible in the admin.

Previously the button was declared as a UI field inside a `Parsing` tab and was conditionally hidden while the document had no `id` (i.e. before the first save). Users could not find the button after uploading a PDF because it only appeared if they remembered to click the `Parsing` tab *after* saving.

Now:

- The `parse_action` UI field is rendered at the top of the form, outside the tabs, so it shows up as soon as the document is opened.
- The button is always rendered — when the document has not been saved yet, it is disabled with the hint "Upload a PDF and save the document to enable parsing." This makes the flow discoverable without relying on users knowing they need to save first.
- Status, job id, parsed-at and the error textarea are still on the form but at top-level (status/job/date in the sidebar) so the remaining `tabs` (`Params`, `Output`) only group things that actually belong together.
- `toast.info` is replaced with `toast.success` for the "Parsing started" notification to avoid a possible runtime mismatch with the subset of toast methods re-exported from `@payloadcms/ui`.

No config or behavior changes on the server side — only how the admin surfaces the existing flow.
