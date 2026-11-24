export type RevalidationTarget = {
  url: string
  secret: string
}

export type TargetConfig = RevalidationTarget | RevalidationTarget[]

export const normalizeTargets = (config?: TargetConfig): RevalidationTarget[] => {
  if (!config) return []
  return Array.isArray(config) ? config : [config]
}
