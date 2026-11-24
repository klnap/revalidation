import { defineRevalidation, POST } from '@klnap/revalidation/consumers/next'

defineRevalidation({
  secret: 'smoke-secret',
  maxBodyBytes: 64,
  tags: { item: 'test:[key]' },
  paths: { report: '/reports' },
  resolve: (event) => (event.key === 'report' ? 'report' : 'data'),
  params: (event) => ({ key: event.key }),
  invalidate: (tags, paths) => ({
    data: [tags.item],
    report: { paths: [paths.report] },
  }),
})

export { POST }
