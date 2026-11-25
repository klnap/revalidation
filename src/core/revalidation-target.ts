export type RevalidationTarget = {
  url: string
  secret: string
}

export type TargetConfig = RevalidationTarget | RevalidationTarget[]

export const toTargetList = (config: TargetConfig): RevalidationTarget[] =>
  Array.isArray(config) ? config : [config]
