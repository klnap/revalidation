import type { TargetConfig } from './revalidation-target.js'

let pluginTarget: TargetConfig | undefined

/**
 * Set by `revalidation({ target })` when the Payload plugin initializes.
 * Single-process registry (one Payload config per process is the supported model).
 */
export const setRevalidationPluginTarget = (target: TargetConfig | undefined): void => {
  pluginTarget = target
}

export const getRevalidationPluginTarget = (): TargetConfig | undefined => pluginTarget

/** Test helper — resets plugin-level target inheritance. */
export const resetRevalidationPluginTarget = (): void => {
  pluginTarget = undefined
}
