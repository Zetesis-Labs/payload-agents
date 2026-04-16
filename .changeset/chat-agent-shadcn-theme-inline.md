---
"@zetesis/chat-agent": patch
---

Emit shadcn utilities in `dist/styles.css` by adding `@theme inline` to `src/styles/input.css`. Tailwind v4 needs the `--color-*` tokens mapped to the host's CSS variables at package build time; without this block the bundled stylesheet was missing `bg-background`, `border-border`, `text-foreground`, etc., so chat widgets rendered transparent in host apps that didn't regenerate those utilities from their own source.
