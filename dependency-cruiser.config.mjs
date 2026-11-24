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
      name: 'routing-no-forbidden-npm',
      severity: 'error',
      from: { path: '^src/dispatchers/routing/' },
      to: {
        dependencyTypes: ['npm'],
        path: '(^|/)node_modules/(payload|next)(/|$)',
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
      name: 'producers-only-core-internals',
      severity: 'error',
      comment: 'producers may import core, sibling producer modules, and sources/payload',
      from: { path: '^src/producers/' },
      to: {
        path: '^src/',
        pathNot: ['^src/core/', '^src/producers/', '^src/sources/payload/'],
      },
    },
    {
      name: 'consumers-only-core',
      severity: 'error',
      comment: 'consumers may import core and documented Payload wire schema (sources/payload)',
      from: { path: '^src/consumers/' },
      to: {
        path: '^src/',
        pathNot: ['^src/core/', '^src/consumers/', '^src/sources/payload/'],
      },
    },
    {
      name: 'dispatchers-no-producers-consumers',
      severity: 'error',
      from: { path: '^src/dispatchers/' },
      to: { path: '^src/(producers|consumers)/' },
    },
    {
      name: 'routing-only-core',
      severity: 'error',
      from: { path: '^src/dispatchers/routing/' },
      to: {
        path: '^src/',
        pathNot: ['^src/core/', '^src/dispatchers/routing/'],
      },
    },
    {
      name: 'http-dispatcher-boundary',
      severity: 'error',
      from: { path: '^src/dispatchers/http/' },
      to: {
        path: '^src/',
        pathNot: ['^src/core/', '^src/dispatchers/routing/', '^src/dispatchers/http/'],
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
    {
      name: 'sources-payload-only-core',
      severity: 'error',
      from: { path: '^src/sources/payload/' },
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
