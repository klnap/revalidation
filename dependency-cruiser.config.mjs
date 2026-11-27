/** @type {import('dependency-cruiser').IConfiguration} */
const config = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'core-no-forbidden-npm',
      severity: 'error',
      comment: 'core may not depend on payload or next',
      from: { path: '^src/core/' },
      to: {
        dependencyTypes: ['npm'],
        path: '(^|/)node_modules/(payload|next)(/|$)',
      },
    },
    {
      name: 'producers-no-forbidden-npm',
      severity: 'error',
      from: { path: '^src/producers/' },
      to: {
        dependencyTypes: ['npm'],
        path: '(^|/)node_modules/next(/|$)',
      },
    },
    {
      name: 'http-no-forbidden-npm',
      severity: 'error',
      from: { path: '^src/dispatchers/http/' },
      to: {
        dependencyTypes: ['npm'],
        path: '(^|/)node_modules/(payload|next)(/|$)',
      },
    },
    {
      name: 'consumers-next-no-forbidden-npm',
      severity: 'error',
      from: { path: '^src/consumers/next/' },
      to: {
        dependencyTypes: ['npm'],
        path: '(^|/)node_modules/payload(/|$)',
      },
    },
    {
      name: 'producers-only-core',
      severity: 'error',
      comment: 'producers may import only core and their own implementation',
      from: { path: '^src/producers/' },
      to: {
        path: '^src/',
        pathNot: ['^src/core/', '^src/producers/'],
      },
    },
    {
      name: 'consumers-only-core',
      severity: 'error',
      comment: 'consumers may import framework-independent core and sibling modules',
      from: { path: '^src/consumers/' },
      to: {
        path: '^src/',
        pathNot: ['^src/core/', '^src/consumers/'],
      },
    },
    {
      name: 'dispatchers-no-producers-consumers',
      severity: 'error',
      from: { path: '^src/dispatchers/' },
      to: { path: '^src/(producers|consumers)/' },
    },
    {
      name: 'http-dispatcher-boundary',
      severity: 'error',
      from: { path: '^src/dispatchers/http/' },
      to: {
        path: '^src/',
        pathNot: ['^src/core/', '^src/dispatchers/http/'],
      },
    },
    {
      name: 'media-not-to-lifecycle-except-helpers',
      severity: 'error',
      from: { path: '^src/producers/payload/media/' },
      to: {
        path: '^src/producers/payload/lifecycle/',
        pathNot: ['^src/producers/payload/lifecycle/helpers\\.ts$'],
      },
    },
    {
      name: 'core-only-core',
      severity: 'error',
      from: { path: '^src/core/' },
      to: {
        path: '^src/',
        pathNot: ['^src/core/'],
      },
    },
  ],
  options: {
    exclude: { path: '\\.(?:test|spec)\\.tsx?$' },
    doNotFollow: { path: 'node_modules' },
    parser: 'swc',
    tsConfig: { fileName: 'tsconfig.json' },
  },
}

export default config
