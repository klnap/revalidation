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
  layers: (t, _p) => ({
    next: [
      {
        key: { payload: 'home-page' },
        // @ts-expect-error — unknown tag on BuiltTags
        invalidates: [t.unknownTag],
      },
    ],
  }),
})

defineRevalidation({
  secret: 's',
  tags: { homePage: '[locale]:home-page' },
  // @ts-expect-error — key.medusa requires sources.medusa
  sources: { payload: src },
  layers: (t, _p) => ({
    next: [{ key: { payload: 'home-page', medusa: 'x' }, invalidates: [t.homePage] }],
  }),
})

defineRevalidation({
  secret: 's',
  tags: { homePage: '[locale]:home-page' },
  paths: { homePath: '/[locale]' },
  sources: { payload: src },
  layers: (_t, p) => ({
    next: [
      {
        key: { payload: 'home-page' },
        invalidates: {
          // @ts-expect-error — unknown path on BuiltPaths
          paths: [p.unknownPath],
        },
      },
    ],
  }),
})
