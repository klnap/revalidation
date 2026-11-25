import { defineRevalidation } from '@klnap/revalidation/consumers/next'
import { payloadRevalidationItemSchema } from '@klnap/revalidation/sources/payload'

const src = {
  schema: payloadRevalidationItemSchema,
  resolve: () => 'home-page',
}

defineRevalidation({
  secret: 's',
  tags: { homePage: '[locale]:home-page' },
  sources: { payload: src },
  layers: ({ tags }) => ({
    next: [
      {
        key: { payload: 'home-page' },
        // @ts-expect-error — unknown tag on BuiltTags
        invalidates: [tags.unknownTag],
      },
    ],
  }),
})

const pathOnly = defineRevalidation({
  secret: 's',
  paths: { homePath: '/[locale]' },
  resolve: (event) => event.key ?? 'home',
  rules: ({ paths }) => ({ home: { paths: [paths.homePath] } }),
})
pathOnly.paths.homePath({ locale: 'en' })
// @ts-expect-error — path-only configuration does not declare cache tags
pathOnly.tags.homePage

const tagOnly = defineRevalidation({
  secret: 's',
  tags: { homeTag: '[locale]:home' },
  resolve: () => 'home',
  rules: ({ tags }) => ({ home: [tags.homeTag] }),
})
tagOnly.tags.homeTag({ locale: 'en' })
// @ts-expect-error — tag-only configuration does not declare cache paths
tagOnly.paths.homePath({ locale: 'en' })

const combined = defineRevalidation({
  secret: 's',
  tags: { homeTag: '[locale]:home' },
  paths: { homePath: '/[locale]' },
  resolve: () => 'home',
  rules: ({ tags, paths }) => ({
    home: { tags: [tags.homeTag], paths: [paths.homePath] },
  }),
})
combined.tags.homeTag({ locale: 'en' })
combined.paths.homePath({ locale: 'en' })

// @ts-expect-error — a simple rules configuration requires explicit resolution
defineRevalidation({
  secret: 's',
  tags: { homeTag: '[locale]:home' },
  rules: ({ tags }) => ({ home: [tags.homeTag] }),
})

defineRevalidation({
  secret: 's',
  tags: { homePage: '[locale]:home-page' },
  // @ts-expect-error — key.medusa requires sources.medusa
  sources: { payload: src },
  layers: ({ tags }) => ({
    next: [{ key: { payload: 'home-page', medusa: 'x' }, invalidates: [tags.homePage] }],
  }),
})

const advancedPaths = defineRevalidation({
  secret: 's',
  paths: { homePath: '/[locale]' },
  sources: { payload: src },
  layers: ({ paths }) => ({
    next: [
      {
        key: { payload: 'home-page' },
        invalidates: {
          // @ts-expect-error — unknown path on BuiltPaths
          paths: [paths.unknownPath],
        },
      },
    ],
  }),
})
advancedPaths.paths.homePath({ locale: 'en' })
