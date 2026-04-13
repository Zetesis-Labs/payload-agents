import type { Payload } from 'payload'
import { ensureTaxonomiesExist, type Localized, resolveLocalized } from './shared'

/** Post shape with potentially localized fields (as exported JSON) */
interface LocalizedPost {
  id: number
  title: string | Record<string, string>
  slug?: string | Record<string, string>
  publishedAt?: string
  content?: unknown | Record<string, unknown>
  text_transforms?: string[]
  categories?: ({ id: number; name: string | Record<string, string>; slug?: string } | number)[] | null
}

export const seedPost =
  (payload: Payload, mode: 'create' | 'upsert', options?: { skipIndexSync?: boolean }) =>
  async (postData: LocalizedPost) => {
    const logger = payload.logger

    logger.debug(`Processing post ${postData.id} with slug ${postData.slug}`)

    try {
      const existingPosts = await payload.find({
        collection: 'posts',
        where: { id: { equals: postData.id } },
        limit: 1
      })

      const existingPost = existingPosts.docs[0]

      if (existingPost && mode === 'create') {
        logger.debug(`Post ${postData.id} already exists and mode is 'create', skipping...`)
        return
      }

      const categoryIds = await ensureTaxonomiesExist(payload, postData.categories)

      const postPayload = {
        title: resolveLocalized(postData.title),
        generateSlug: !postData.slug,
        slug: resolveLocalized(postData.slug) || '',
        publishedAt: postData.publishedAt,
        content: resolveLocalized(postData.content),
        text_transforms: postData.text_transforms,
        categories: categoryIds.length > 0 ? categoryIds : undefined
      }

      if (existingPost) {
        await payload.update({
          collection: 'posts',
          id: existingPost.id,
          data: postPayload,
          context: { skipIndexSync: options?.skipIndexSync }
        })
        logger.debug(`Post ${postData.id} updated`)
      } else {
        await payload.create({
          collection: 'posts',
          draft: false,
          data: {
            ...postPayload,
            id: postData.id
          },
          context: { skipIndexSync: options?.skipIndexSync }
        })
        logger.debug(`New post created with ID: ${postData.id}`)
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const label = postData.title || postData.slug || postData.id
      logger.error(`Error processing post [${label}]: ${errorMessage}`)
      throw error
    }
  }
