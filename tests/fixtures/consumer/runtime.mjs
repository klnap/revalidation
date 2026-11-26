import assert from 'node:assert/strict'
import { payloadSchema, payloadSource } from '@klnap/revalidation/sources/payload'
import { revalidation } from '@klnap/revalidation/producers/payload'
import { defineRevalidation } from '@klnap/revalidation/consumers/next'
import { http as dispatchersHttp } from '@klnap/revalidation/dispatchers'
import { http } from '@klnap/revalidation/dispatchers/http'

for (const entry of [
  payloadSchema,
  payloadSource,
  revalidation,
  defineRevalidation,
  dispatchersHttp,
  http,
]) {
  assert.ok(entry)
}
