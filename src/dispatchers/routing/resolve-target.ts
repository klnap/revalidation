import { getRevalidationPluginTarget } from '../../core/plugin-target.js'
import type { RevalidationTarget, TargetConfig } from '../../core/revalidation-target.js'
import { normalizeTargets } from '../../core/revalidation-target.js'

export {
  resetRevalidationPluginTarget,
  setRevalidationPluginTarget,
} from '../../core/plugin-target.js'

/**
 * Factory `target` wins; otherwise inherits the plugin-level `target`.
 * Always returns a flat list (single object → one element).
 */
export const resolveRevalidationTargets = (factoryTarget?: TargetConfig): RevalidationTarget[] => {
  const chosen = factoryTarget ?? getRevalidationPluginTarget()
  return normalizeTargets(chosen)
}
