// Compile-time checks for cache tag helpers. Run by `bun run typecheck` (tsconfig.types.json).
import { defineRevalidation } from '../../src/consumers/next/define-revalidation'
import { invalidKey } from '../../src/consumers/next/index'

const { tags } = defineRevalidation({
  secret: 's',
  tags: { page: '[locale]:page:[slug]', home: '[locale]:home' },
  resolve: (event) => event.key ?? invalidKey(),
  invalidate: (t) => ({ pages: [t.page] }),
})

// Positive: declared names and well-typed parameters compile.
tags.page({ locale: 'en', slug: 'about' })
tags.home({ locale: 'de' })

// Negative: unknown tag name.
// @ts-expect-error — no tag named `nope`
tags.nope({ locale: 'en' })

// Negative: parameter values must be strings.
// @ts-expect-error — slug must be a string
tags.page({ locale: 'en', slug: 1 })

// Negative: a tag with parameters cannot be called without them.
// @ts-expect-error — parameters are required by the signature
tags.page()
