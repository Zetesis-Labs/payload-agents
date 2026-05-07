'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '../lib/cn'

export function ComboboxFilter({
  label,
  value,
  onChange,
  basePath,
  field,
  tenantId,
  placeholder,
  className
}: {
  label: string
  value: string
  onChange: (value: string) => void
  basePath: string
  field: 'agent' | 'model' | 'user'
  tenantId?: string
  placeholder?: string
  className?: string
}) {
  const [query, setQuery] = useState(value)
  const [options, setOptions] = useState<Array<{ label: string; value: string }>>([])
  const [hasMore, setHasMore] = useState(false)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const skipNextDebounceRef = useRef(false)

  useEffect(() => {
    if (!value) setQuery('')
  }, [value])

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const fetchOptions = useCallback(
    (q: string) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)
      const params = new URLSearchParams({ field, q })
      if (tenantId) params.set('tenantId', tenantId)
      fetch(`/api${basePath}/filter-options?${params.toString()}`, {
        credentials: 'include',
        signal: controller.signal
      })
        .then(r => r.json())
        .then((data: { options?: Array<{ label: string; value: string }>; hasMore?: boolean }) => {
          if (controller.signal.aborted) return
          setOptions(data.options ?? [])
          setHasMore(data.hasMore ?? false)
          setOpen(true)
        })
        .catch(err => {
          if (err?.name === 'AbortError') return
          setOptions([])
        })
        .finally(() => {
          if (controller.signal.aborted) return
          setLoading(false)
        })
    },
    [field, basePath, tenantId]
  )

  useEffect(() => {
    if (skipNextDebounceRef.current) {
      skipNextDebounceRef.current = false
      return
    }
    if (query.length < 1) return
    const timeout = setTimeout(() => fetchOptions(query), 250)
    return () => clearTimeout(timeout)
  }, [query, fetchOptions])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current) return
      if (!(e.target instanceof Node)) return
      if (containerRef.current.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function select(opt: { label: string; value: string }) {
    skipNextDebounceRef.current = true
    onChange(opt.value)
    setQuery(opt.label)
    setOpen(false)
  }

  function clear() {
    onChange('')
    setQuery('')
    setOptions([])
    setOpen(false)
  }

  return (
    <div className={cn('flex flex-col gap-1 text-xs', className)} ref={containerRef}>
      <span className="text-muted-foreground">{label}</span>
      <div className="relative w-full">
        <div className="flex items-center w-full">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => fetchOptions(query)}
            placeholder={placeholder}
            className="combobox-input min-w-0"
          />
          {(value || query) && (
            <button
              type="button"
              onClick={clear}
              className="absolute right-2 text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          )}
        </div>
        {open && (options.length > 0 || loading) && (
          <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md text-xs">
            {loading && <div className="px-3 py-2 text-muted-foreground">Loading…</div>}
            {!loading &&
              options.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-muted transition-colors block"
                  onClick={() => select(opt)}
                >
                  {opt.label}
                </button>
              ))}
            {!loading && hasMore && (
              <div className="border-t border-border px-3 py-2 text-muted-foreground italic">
                Refine your search to see more results
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
