import assert from 'node:assert/strict'
import { request as httpRequest } from 'node:http'
import { Webhook } from 'standardwebhooks'

const base = `http://127.0.0.1:${process.argv[2]}`
const request = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(5_000) })
const get = async (key) => (await request(`${base}/api/data?key=${key}`)).json()
const report = async () => (await request(`${base}/reports/report`)).text()
const secret = `whsec_${Buffer.from('smoke-secret').toString('base64')}`
const send = (key) => {
  const body = JSON.stringify({
    specversion: '1.0',
    id: `rev_${key}`,
    source: 'urn:klnap:revalidation:payload',
    type: 'com.klnap.revalidation.resource.changed.v1',
    datacontenttype: 'application/json',
    data: {
      operation: 'update',
      resource: { type: 'payload.collection', name: 'pages' },
      affected: [
        {
          operation: 'update',
          resource: { type: 'payload.collection', name: 'pages', slug: key },
        },
      ],
    },
  })
  const id = `wh_${key}`
  const timestamp = new Date()
  return request(`${base}/api/revalidate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/cloudevents+json',
      'webhook-id': id,
      'webhook-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
      'webhook-signature': new Webhook(secret).sign(id, timestamp, body),
    },
    body,
  })
}

assert.deepEqual(await get('target'), { value: 'old-target' })
assert.deepEqual(await get('other'), { value: 'old-other' })
assert.deepEqual(await get('stale'), { value: 'old-stale' })
assert.match(await report(), /old-other/)

assert.equal((await request(`${base}/api/mutate`, { method: 'POST' })).status, 200)
assert.deepEqual(await get('target'), { value: 'old-target' })
assert.match(await report(), /old-other/)

const denied = await request(`${base}/api/revalidate`, {
  method: 'POST',
  headers: { 'content-type': 'application/cloudevents+json' },
  body: '{}',
})
assert.equal(denied.status, 401)
assert.deepEqual(await get('target'), { value: 'old-target' })

const oversizedStatus = await new Promise((resolve, reject) => {
  let responseReceived = false
  const request = httpRequest(
    new URL('/api/revalidate', base),
    {
      method: 'POST',
      headers: {
        'content-type': 'application/cloudevents+json',
        'transfer-encoding': 'chunked',
      },
    },
    (response) => {
      responseReceived = true
      clearTimeout(timeout)
      response.resume()
      request.destroy()
      resolve(response.statusCode)
    },
  )
  const timeout = setTimeout(() => {
    request.destroy()
    reject(new Error('oversized chunked request did not receive a response promptly'))
  }, 3_000)
  request.on('error', (error) => {
    if (!responseReceived) {
      clearTimeout(timeout)
      reject(error)
    }
  })
  request.write('x'.repeat(1025))
})
assert.equal(oversizedStatus, 413)

assert.equal((await send('target')).status, 200)
assert.deepEqual(await get('target'), { value: 'new-target' })
assert.deepEqual(await get('other'), { value: 'old-other' })
assert.match(await report(), /old-other/)

assert.equal((await send('report')).status, 200)
assert.match(await report(), /new-other/)
assert.deepEqual(await get('other'), { value: 'old-other' })

assert.equal((await send('stale')).status, 200)
let staleValue = (await get('stale')).value
for (let attempt = 0; attempt < 20 && staleValue !== 'new-stale'; attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 50))
  staleValue = (await get('stale')).value
}
assert.equal(staleValue, 'new-stale')

assert.equal((await request(`${base}/api/mutate`, { method: 'POST' })).status, 200)
assert.deepEqual(await get('target'), { value: 'new-target' })
const partial = await send('partial')
assert.equal(partial.status, 500)
assert.deepEqual(await get('target'), { value: 'partial-target' })
assert.doesNotMatch(await partial.text(), /private index failure/)

console.log('Next production cache smoke passed')
