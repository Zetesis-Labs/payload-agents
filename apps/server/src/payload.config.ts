import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { agentPlugin } from '@zetesis/payload-agents-core'
import { metricsPlugin } from '@zetesis/payload-agents-metrics'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import type { Payload } from 'payload'
import { buildConfig } from 'payload'
import { Media } from './collections/Media'
import { Posts } from './collections/Posts'
import { Taxonomies } from './collections/Taxonomies'
import { Users } from './collections/Users'
import { defaultLocale, locales } from './i18n/locales'
import { typesensePlugin } from './plugins/typesense'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/** Default daily token limit for all users (500k tokens). */
async function getDailyLimit(_payload: Payload, _userId: string | number): Promise<number> {
  return 500_000_000
}

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
  plugins: (() => {
    const metrics = metricsPlugin({ multiTenant: false, basePath: '/metrics' })
    return [
      typesensePlugin,
      agentPlugin({
        runtimeUrl: process.env.AGENT_RUNTIME_URL || 'http://agent-runtime:8000',
        runtimeSecret: process.env.INTERNAL_SECRET,
        getDailyLimit,
        encryptionKey: process.env.PAYLOAD_SECRET,
        basePath: '/chat',
        mediaCollectionSlug: 'media',
        taxonomyCollectionSlug: 'taxonomy',
        onRunCompleted: metrics.onRunCompleted
      }),
      metrics
    ]
  })()
})
