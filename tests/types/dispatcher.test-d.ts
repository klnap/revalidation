// Compile-time checks for dispatcher-owned targets. Run by `bun run typecheck`.
import { http } from '@klnap/revalidation/dispatchers/http'
import type { PayloadRevalidationPluginConfig } from '@klnap/revalidation/producers/payload'

const dispatcher = http({
  target: { url: 'https://example.test/revalidate', secret: 'secret' },
})

// @ts-expect-error — HTTP dispatchers require an explicit target.
http({})

const pluginConfig: PayloadRevalidationPluginConfig = { dispatcher }

const pluginConfigWithTarget: PayloadRevalidationPluginConfig = {
  dispatcher,
  // @ts-expect-error — the Payload plugin does not own HTTP target configuration.
  target: { url: 'https://example.test/revalidate', secret: 'secret' },
}

void pluginConfig
void pluginConfigWithTarget
