import assert from 'node:assert/strict'
import { request as httpRequest } from 'node:http'

const base = `http://127.0.0.1:${process.argv[2]}`
const request = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(5_000) })
const get = async (key) => (await request(`${base}/api/data?key=${key}`)).json()
const report = async () => (await request(`${base}/reports`)).text()
const send = (key) =>
  request(`${base}/api/revalidate`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer smoke-secret',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ source: 'test', data: { key } }),
  })

assert.deepEqual(await get('target'), { value: 'old-target' })
assert.deepEqual(await get('other'), { value: 'old-other' })
assert.match(await report(), /old-other/)

assert.equal((await request(`${base}/api/mutate`, { method: 'POST' })).status, 200)
assert.deepEqual(await get('target'), { value: 'old-target' })
assert.match(await report(), /old-other/)

const denied = await request(`${base}/api/revalidate`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ source: 'test', data: { key: 'target' } }),
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
        authorization: 'Bearer smoke-secret',
        'content-type': 'application/json',
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
  request.write('x'.repeat(65))
})
assert.equal(oversizedStatus, 400)

assert.equal((await send('target')).status, 200)
assert.deepEqual(await get('target'), { value: 'new-target' })
assert.deepEqual(await get('other'), { value: 'old-other' })
assert.match(await report(), /old-other/)

assert.equal((await send('report')).status, 200)
assert.match(await report(), /new-other/)
assert.deepEqual(await get('other'), { value: 'old-other' })

console.log('Next production cache smoke passed')
