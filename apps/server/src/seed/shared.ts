import type { Payload } from 'payload'
import { defaultLocale, locales } from '@/i18n/locales'

/**
 * Transforms a Payload type to represent its exported JSON shape,
 * where localized fields appear as `Record<Locale, T>` instead of `T`.
 */
export type Localized<T, Fields extends keyof T, Locales extends string = (typeof locales)[number]> = Omit<T, Fields> & {
  [K in Fields]: T[K] | Record<Locales, T[K]>
}

/**
 * Resolve a potentially localized value.
 * Exported data may have `{ en: "X", es: "Y" }` for localized fields.
 * Accepts both plain values and locale maps, returning the resolved value.
 */
export function resolveLocalized<T>(value: T | Record<string, T>): T {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj)
  const isLocaleMap = keys.length > 0 && keys.every(k => (locales as readonly string[]).includes(k))
  if (!isLocaleMap) return value as T
  const localeKey = (locales as readonly string[]).find(l => l in obj) ?? defaultLocale
  return obj[localeKey] as T
}

/** Taxonomy shape as it appears in exported JSON */
interface TaxonomyData {
  id: number
  name: string | Record<string, string>
  slug?: string
}

/**
 * Ensures taxonomies exist, creating them if full data is provided.
 * Accepts both IDs (verified) and full objects (upserted).
 */
export async function ensureTaxonomiesExist(
  payload: Payload,
  categories?: (TaxonomyData | number)[] | null
): Promise<number[]> {
  if (!categories || !Array.isArray(categories)) {
    return []
  }

  const categoryIds: number[] = []

  for (const cat of categories) {
    if (typeof cat === 'number') {
      // Verify ID exists
      try {
        await payload.findByID({ collection: 'taxonomy', id: cat })
        categoryIds.push(cat)
      } catch {
        payload.logger.warn(`Taxonomy ID ${cat} not found, skipping`)
      }
      continue
    }

    // Full object — upsert
    if (!cat.id) continue

    const name = resolveLocalized(cat.name)
    if (!name) continue

    try {
      const existing = await payload.find({
        collection: 'taxonomy',
        where: { id: { equals: cat.id } },
        limit: 1
      })

      if (existing.docs[0]) {
        categoryIds.push(existing.docs[0].id as number)
      } else {
        const created = await payload.create({
          collection: 'taxonomy',
          data: { id: cat.id, name } as Record<string, unknown>
        })
        categoryIds.push(created.id as number)
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      payload.logger.warn(`Failed to ensure taxonomy ${cat.id}: ${msg}`)
    }
  }

  return categoryIds
}
