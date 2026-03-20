import { buildTaxonomyRelationship } from '@zetesis/payload-taxonomies'
import { type CollectionConfig, slugField } from 'payload'

export const Posts: CollectionConfig = {
  slug: 'posts',
  access: {
    read: () => true
  },
  admin: {
    useAsTitle: 'title'
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      localized: true
    },
    slugField({ useAsSlug: 'title', localized: true }),
    {
      name: 'publishedAt',
      type: 'date',
      index: true,
      admin: {
        date: {
          pickerAppearance: 'dayAndTime'
        }
      }
    },
    {
      name: 'content',
      type: 'richText',
      localized: true
    },
    {
      name: 'text_transforms',
      type: 'select',
      hasMany: true,
      admin: {
        description:
          'Transforms to apply to the content text before indexing. Order matters.',
        position: 'sidebar'
      },
      options: [
        { label: 'Strip URLs', value: 'strip-urls' },
        { label: 'Strip mentions (@user)', value: 'strip-mentions' },
        { label: 'Normalize whitespace', value: 'normalize-whitespace' }
      ]
    },
    buildTaxonomyRelationship({
      name: 'categories',
      label: 'Categories',
      required: false
    })
  ]
}
