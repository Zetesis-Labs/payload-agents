import { describe, expect, it } from 'vitest'
import { applyQueryRewriteTemplate } from './query-rewrite'

describe('applyQueryRewriteTemplate', () => {
  it('substitutes {{query}} verbatim', () => {
    expect(applyQueryRewriteTemplate('{{query}} en filosofía austríaca', { query: 'justicia' })).toBe(
      'justicia en filosofía austríaca'
    )
  })

  it('handles whitespace inside braces', () => {
    expect(applyQueryRewriteTemplate('{{ query }}', { query: 'libertad' })).toBe('libertad')
  })

  it('expands tenant_slug', () => {
    expect(applyQueryRewriteTemplate('{{query}} ({{tenant_slug}})', { query: 'IRPF', tenant_slug: 'bastos' })).toBe(
      'IRPF (bastos)'
    )
  })

  it('expands unknown variables to empty string', () => {
    expect(applyQueryRewriteTemplate('{{query}} {{unknown_var}}', { query: 'IRPF' })).toBe('IRPF')
  })

  it('collapses whitespace runs caused by missing vars', () => {
    expect(applyQueryRewriteTemplate('{{query}}   {{missing}}   end', { query: 'a' })).toBe('a end')
  })

  it('returns trimmed empty string when only missing vars resolve', () => {
    expect(applyQueryRewriteTemplate('{{missing_a}} {{missing_b}}', { query: 'x' })).toBe('')
  })

  it('ignores syntactically invalid placeholders', () => {
    expect(applyQueryRewriteTemplate('{{1bad}} {{query}}', { query: 'ok' })).toBe('{{1bad}} ok')
  })
})
