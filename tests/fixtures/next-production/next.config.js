const nextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: { cpus: 1, workerThreads: false, webpackBuildWorker: false },
}

export default nextConfig
