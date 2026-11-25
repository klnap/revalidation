// Compile-time checks for cache tag helpers. Run by `bun run typecheck` (tsconfig.types.json).
import { defineRevalidation, invalidKey } from '@klnap/revalidation/consumers/next'
import { defineRevalidationTags } from '@klnap/revalidation/consumers/next/tags'

const cacheTargets = {
  tags: { article: '[locale]:article:[slug]' },
  paths: { article: '/[locale]/articles/[slug]' },
} as const
const sharedTargets = defineRevalidationTags(cacheTargets)
sharedTargets.tags.article({ locale: 'en', slug: 'about' })
sharedTargets.paths.article({ locale: 'en', slug: 'about' })
// @ts-expect-error — tag-only declarations do not create a route handler
sharedTargets.POST
// @ts-expect-error — at least one tag or path declaration is required
defineRevalidationTags({})

defineRevalidation({
  ...cacheTargets,
  secret: 's',
  resolve: (event) => event.key ?? invalidKey(),
  params: (event) => ({ locale: event.locale, slug: event.slug }),
  rules: ({ tags, paths }) => ({
    pages: { tags: [tags.article], paths: [paths.article] },
  }),
})

defineRevalidation({
  secret: 's',
  resolve: (event) => event.key ?? invalidKey(),
  // @ts-expect-error — configure current rules through `rules`.
  invalidate: () => ({}),
  rules: () => ({}),
})

const { tags, paths } = defineRevalidation({
  secret: 's',
  mode: 'expire',
  tags: {
    page: '[locale]:page:[projectSlug]',
    home: '[locale]:home',
    navigation: 'navigation',
  },
  paths: { page: '/[locale]/[projectSlug]' },
  resolve: (event) => event.key ?? invalidKey(),
  params: (event) => ({ locale: event.locale, projectSlug: event.slug }),
  rules: ({ tags: t, paths: p }) => ({
    pages: { tags: [t.page], paths: [p.page], mode: 'stale' },
  }),
})

// Positive: declared names and well-typed parameters compile.
tags.page({ locale: 'en', projectSlug: 'about' })
paths.page({ locale: 'en', projectSlug: 'about' })
tags.home({ locale: 'de' })
tags.navigation()

// Negative: unknown tag name.
// @ts-expect-error — no tag named `nope`
tags.nope({ locale: 'en' })

// Negative: parameter values must be strings.
// @ts-expect-error — projectSlug must be a string
tags.page({ locale: 'en', projectSlug: 1 })

// Negative: a tag with parameters cannot be called without them.
// @ts-expect-error — parameters are required by the signature
tags.page()

// Negative: every template parameter is required.
// @ts-expect-error — page requires both locale and projectSlug
tags.page({ locale: 'en' })

// Negative: a static tag does not accept parameters.
// @ts-expect-error — navigation has no template parameters
tags.navigation({})
