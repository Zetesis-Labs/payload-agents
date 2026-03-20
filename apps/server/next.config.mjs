import { withPayload } from '@payloadcms/next/withPayload'
import path from 'node:path'

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: path.resolve(import.meta.dirname, '../..'),
  },
}

export default withPayload(nextConfig)
