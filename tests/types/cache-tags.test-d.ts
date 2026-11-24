// Compile-time checks for cache tag helpers. Run by `bun run typecheck` (tsconfig.types.json).
import { defineRevalidation, invalidKey } from '@klnap/revalidation/consumers/next'

const { tags } = defineRevalidation({
  secret: 's',
  tags: { page: '[locale]:page:[slug]', home: '[locale]:home', navigation: 'navigation' },
  resolve: (event) => event.key ?? invalidKey(),
  invalidate: (t) => ({ pages: [t.page] }),
})

// Positive: declared names and well-typed parameters compile.
tags.page({ locale: 'en', slug: 'about' })
tags.home({ locale: 'de' })
tags.navigation()

// Negative: unknown tag name.
// @ts-expect-error — no tag named `nope`
tags.nope({ locale: 'en' })

// Negative: parameter values must be strings.
// @ts-expect-error — slug must be a string
tags.page({ locale: 'en', slug: 1 })

// Negative: a tag with parameters cannot be called without them.
// @ts-expect-error — parameters are required by the signature
tags.page()

// Negative: every template parameter is required.
// @ts-expect-error — page requires both locale and slug
tags.page({ locale: 'en' })

// Negative: a static tag does not accept parameters.
// @ts-expect-error — navigation has no template parameters
tags.navigation({})
