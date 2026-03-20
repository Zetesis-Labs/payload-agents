import { taxonomiesCollection } from '@zetesis/payload-taxonomies'

export const Taxonomies = taxonomiesCollection({
  access: {
    read: () => true
  }
})
