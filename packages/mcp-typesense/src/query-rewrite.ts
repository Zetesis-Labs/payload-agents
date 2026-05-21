/**
 * Minimal Mustache-flavoured template expander used by the SearchProfile's
 * `queryRewrite` field. Only `{{name}}` and `{{ name }}` interpolation are
 * supported — no sections, no escaping, no partials. Unknown variables
 * expand to empty string so a typo in the template degrades gracefully
 * instead of leaving the placeholder visible.
 *
 * Why hand-rolled: the templates are short, the variable set is small and
 * the package already ships to npm with a small dep surface — pulling in
 * Mustache or Handlebars would be 30x the code we actually need.
 */

const MUSTACHE_VAR = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g

export interface QueryRewriteVars {
  query: string
  tenant_slug?: string
}

export function applyQueryRewriteTemplate(template: string, vars: QueryRewriteVars): string {
  const result = template.replace(MUSTACHE_VAR, (_match, name: string) => {
    const value = (vars as Record<string, string | undefined>)[name]
    return value ?? ''
  })
  // Collapse runs of whitespace introduced by missing variables. Typesense's
  // tokenizer ignores them but it keeps the rewritten query readable in
  // traces.
  return result.replace(/\s{2,}/g, ' ').trim()
}
