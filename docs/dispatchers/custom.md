# Custom dispatchers

A dispatcher delivers CloudEvents and returns a `DispatchOutcome`. Implement the public
`Dispatcher` contract when the built-in HTTP dispatcher does not fit your transport or delivery
policy:

```ts
import type { CloudEvent, Dispatcher } from '@klnap/revalidation'

declare function publish(events: readonly CloudEvent[]): Promise<void>

export const dispatcher: Dispatcher = {
  async dispatch({ events }) {
    await publish(events)
    return { status: 'accepted', results: [] }
  },
}
```

Pass the dispatcher to the Payload producer:

```ts
import { revalidation } from '@klnap/revalidation/producers/payload'
import { dispatcher } from './dispatcher.js'

export const revalidationPlugin = revalidation({
  source: 'https://cms.example.com',
  dispatcher,
})
```

The dispatcher receives validated `CloudEvent` values. Return a
`DispatchOutcome` that reflects what the transport actually knows; use `unknown` when it cannot
confirm delivery. The built-in HTTP dispatcher's retry, signing, filtering, and deadline behavior
does not apply to custom implementations.

Batching stays inside each dispatcher. See the [public dispatcher types](../concepts/event-contract.md#dispatcher-contract) and the
[HTTP dispatcher guide](./http.md) for the built-in implementation.
