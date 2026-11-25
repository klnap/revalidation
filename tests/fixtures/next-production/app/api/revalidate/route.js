import { defineRevalidation, invalidKey } from '@klnap/revalidation/consumers/next'

const { POST } = defineRevalidation({
  secret: 'smoke-secret',
  maxBodyBytes: 64,
  tags: { item: 'test:[key]' },
  paths: { report: '/reports' },
  resolve: (event) => {
    if (!event.key) return invalidKey()
    return event.key === 'report' ? 'report' : 'data'
  },
  params: (event) => ({ key: event.key }),
  rules: ({ tags, paths }) => ({
    data: [tags.item],
    report: { paths: [paths.report] },
  }),
})

export { POST }
