---
'@zetesis/payload-agents-metrics': patch
---

Re-export `MetricsPluginResult` (the inferred return type of `metricsPlugin()`) from the package root. Without it, downstream packages that re-export `metricsPlugin(...)` fail with TS4023 ("Exported variable has or is using name from external module but cannot be named"). Same fix that landed in `76a92c1` and was lost in a rebase before the 0.1.0 release.
