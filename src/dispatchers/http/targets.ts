import type { EventSelector } from '../../core/event-selector.js'

export type RevalidationTarget = {
  url: string
  secret: string
  filter?: EventSelector
}

export type TargetConfig = Record<string, RevalidationTarget>

export const toTargetList = (config: TargetConfig) =>
  Object.entries(config).map(([name, target]) => ({ name, ...target }))

export const validateTarget = (
  name: string,
  target: RevalidationTarget,
  allowInsecure = false,
): void => {
  let url: URL
  try {
    url = new URL(target.url)
  } catch {
    throw new TypeError(`HTTP target "${name}" must use a valid HTTPS URL`)
  }
  if (
    url.protocol !== 'https:' &&
    !(
      url.protocol === 'http:' &&
      (allowInsecure || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    )
  ) {
    throw new TypeError(`HTTP target "${name}" must use HTTPS`)
  }
  if (url.username || url.password) {
    throw new TypeError(`HTTP target "${name}" URL must not contain credentials`)
  }
  if (target.secret === undefined || target.secret === '') {
    throw new TypeError(
      `HTTP target "${name}" is missing its signing secret; set a Standard Webhooks secret ("whsec_" followed by base64)`,
    )
  }
  if (
    typeof target.secret !== 'string' ||
    !target.secret.startsWith('whsec_') ||
    target.secret.length <= 6
  ) {
    throw new TypeError(
      `HTTP target "${name}" has a malformed signing secret; expected "whsec_" followed by base64`,
    )
  }
}
