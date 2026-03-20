import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import { Media } from './collections/Media'
import { Posts } from './collections/Posts'
import { Taxonomies } from './collections/Taxonomies'
import { Users } from './collections/Users'
import { defaultLocale, locales } from './i18n/locales'
import { typesensePlugin } from './plugins/typesense'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname)
    }
  },
  localization: {
    locales: [...locales],
    defaultLocale
  },
  collections: [Users, Media, Posts, Taxonomies],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || 'CHANGE_ME',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts')
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || ''
    }
  }),
  graphQL: {
    schemaOutputFile: path.resolve(dirname, 'generated-schema.graphql')
  },
  plugins: [typesensePlugin]
})
