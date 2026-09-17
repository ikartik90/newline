import { vi } from 'vitest'

// ---------------------------------------------------------------------------
// A stand-in for `@aws-sdk/client-s3`: one bucket held in a Map, and the five
// commands r2.ts sends acted out against it. A test installs it with
// `vi.mock('@aws-sdk/client-s3', () => import('./fake-s3'))` and then reads
// or seeds `bucket` directly.
// ---------------------------------------------------------------------------

export interface StoredObject {
  body: Uint8Array
  contentType: string
  metadata: Record<string, string>
  cacheControl?: string
}

export const bucket = new Map<string, StoredObject>()

/** What every `new S3Client(config)` was handed, in order. */
export const clientConfigs: unknown[] = []

let failure: Error | null = null
let listPageSize = 1000

/** Make every `send` reject until reset — the machine is offline. */
export function failWith(error: Error | null): void {
  failure = error
}

export function setListPageSize(size: number): void {
  listPageSize = size
}

export function resetFakeS3(): void {
  bucket.clear()
  clientConfigs.length = 0
  failure = null
  listPageSize = 1000
  send.mockClear()
}

function notFound(): Error {
  const error = new Error('NotFound')
  error.name = 'NotFound'
  return error
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Input = Record<string, any>

class Command {
  constructor(readonly input: Input) {}
}
export class PutObjectCommand extends Command {}
export class HeadObjectCommand extends Command {}
export class CopyObjectCommand extends Command {}
export class ListObjectsV2Command extends Command {}
export class DeleteObjectCommand extends Command {}

export const send = vi.fn(async (command: Command): Promise<Input> => {
  if (failure) throw failure
  const { input } = command

  if (command instanceof PutObjectCommand) {
    bucket.set(input.Key, {
      body: input.Body,
      contentType: input.ContentType,
      metadata: input.Metadata ?? {},
      cacheControl: input.CacheControl
    })
    return {}
  }

  if (command instanceof HeadObjectCommand) {
    const object = bucket.get(input.Key)
    if (!object) throw notFound()
    return {
      ContentLength: object.body.byteLength,
      ContentType: object.contentType,
      Metadata: object.metadata
    }
  }

  if (command instanceof CopyObjectCommand) {
    const source = bucket.get(String(input.CopySource).split('/').slice(1).join('/'))
    if (!source) throw notFound()
    bucket.set(input.Key, {
      body: source.body,
      contentType: input.ContentType ?? source.contentType,
      metadata: input.MetadataDirective === 'REPLACE' ? (input.Metadata ?? {}) : source.metadata,
      cacheControl: input.CacheControl ?? source.cacheControl
    })
    return {}
  }

  if (command instanceof ListObjectsV2Command) {
    const keys = [...bucket.keys()].filter((key) => key.startsWith(input.Prefix ?? '')).sort()
    const offset = Number(input.ContinuationToken ?? 0)
    const page = keys.slice(offset, offset + listPageSize)
    const next = offset + listPageSize
    return {
      Contents: page.map((Key) => ({ Key })),
      IsTruncated: next < keys.length,
      NextContinuationToken: next < keys.length ? String(next) : undefined
    }
  }

  if (command instanceof DeleteObjectCommand) {
    bucket.delete(input.Key)
    return {}
  }

  throw new Error(`fake-s3: unknown command ${command.constructor.name}`)
})

export class S3Client {
  send = send
  constructor(config: unknown) {
    clientConfigs.push(config)
  }
}
