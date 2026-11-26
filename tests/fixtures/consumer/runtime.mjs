import assert from 'node:assert/strict'
import { createPipeline } from '@klnap/revalidation'
import { payloadRevalidationItemSchema } from '@klnap/revalidation/sources/payload'
import { revalidation } from '@klnap/revalidation/producers/payload'
import { defineRevalidation } from '@klnap/revalidation/consumers/next'
import { defineRevalidationTags } from '@klnap/revalidation/consumers/next/tags'
import { http as dispatchersHttp } from '@klnap/revalidation/dispatchers'
import { http } from '@klnap/revalidation/dispatchers/http'

for (const entry of [
  createPipeline,
  payloadRevalidationItemSchema,
  revalidation,
  defineRevalidation,
  defineRevalidationTags,
  dispatchersHttp,
  http,
]) {
  assert.ok(entry)
}
