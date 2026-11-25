// Type-check the public API examples in README.md.
import type { NextConfig } from 'next'
import { cacheTag } from 'next/cache'
import type { CollectionConfig, GlobalConfig } from 'payload'
import { buildConfig } from 'payload'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { http } from '@klnap/revalidation/dispatchers/http'
import { defineRevalidation, invalidKey } from '@klnap/revalidation/consumers/next'
import { defineRevalidationTags } from '@klnap/revalidation/consumers/next/tags'
import { revalidation } from '@klnap/revalidation/producers/payload'

const nextConfig: NextConfig = { cacheComponents: true }

const cacheTargets = {
  tags: { page: '[locale]:page:[projectSlug]', siteSettings: '[locale]:site-settings' },
  paths: { page: '/[locale]/[projectSlug]' },
} as const
const { tags, paths } = defineRevalidationTags(cacheTargets)
const { POST } = defineRevalidation({
  ...cacheTargets,
  secret: 'secret',
  mode: 'expire',
  resolve: (event) => event.key ?? invalidKey(),
  params: (event) => ({ locale: event.locale, projectSlug: event.slug }),
  rules: ({ tags: ruleTags, paths: rulePaths }) => ({
    pages: { tags: [ruleTags.page], paths: [rulePaths.page] },
    'site-settings': [ruleTags.siteSettings],
  }),
})

async function getPage() {
  'use cache'
  cacheTag(tags.page({ locale: 'en', projectSlug: 'about' }))
  return paths.page({ locale: 'en', projectSlug: 'about' })
}

const media: CollectionConfig = {
  slug: 'media',
  upload: true,
  fields: [{ name: 'alt', type: 'text', localized: true }],
}
const pages: CollectionConfig = {
  slug: 'pages',
  custom: { revalidation: true },
  fields: [
    { name: 'title', type: 'text', localized: true },
    { name: 'slug', type: 'text', required: true, localized: true },
    { name: 'heroImage', type: 'upload', relationTo: 'media' },
  ],
}
const siteSettings: GlobalConfig = {
  slug: 'site-settings',
  custom: { revalidation: true },
  fields: [{ name: 'siteName', type: 'text', localized: true }],
}
const payloadPlugin = revalidation({
  dispatcher: http({ target: { url: 'https://example.test/revalidate', secret: 'secret' } }),
  media,
})
const payloadConfig = buildConfig({
  secret: 'secret',
  db: sqliteAdapter({ client: { url: 'file:./payload.db' } }),
  localization: {
    locales: ['en', 'fr'],
    defaultLocale: 'en',
  },
  collections: [media, pages],
  globals: [siteSettings],
  plugins: [payloadPlugin],
})

void nextConfig
void POST
void getPage
void pages
void siteSettings
void payloadPlugin
void payloadConfig
