import {
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'

// ---------------------------------------------------------------------------
// The bucket, as kartik.to's `lib/storage/r2.ts` — minus the presigned URLs.
// Main holds the credentials and PUTs the bytes itself, so metadata could go
// on the PUT; it is still stamped afterwards so an object always carries the
// same map whichever path wrote it.
// ---------------------------------------------------------------------------

export const MEDIA_PREFIX = 'media/'

/** The stills taken from clips, kept out of the library's listing. */
export const POSTER_PREFIX = 'posters/'

/** What the listing counts as a library object; the bucket is not only ours. */
const MEDIA_KEY_PATTERN = /\.(png|jpe?g|gif|webp|svg|mp4|pdf)$/i

/** Every key carries a uuid, so an object's bytes never change. */
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable'

interface R2Config {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucketName: string
  publicBaseUrl: string
}

/**
 * electron-vite inlines `import.meta.env.MAIN_VITE_*` at build time;
 * `process.env` carries the same names in a dev shell and under vitest.
 * Read on every call so a test can change its mind.
 */
function readConfig(): R2Config | null {
  const env = import.meta.env
  const accountId = env.MAIN_VITE_R2_ACCOUNT_ID || process.env.MAIN_VITE_R2_ACCOUNT_ID
  const accessKeyId = env.MAIN_VITE_R2_ACCESS_KEY_ID || process.env.MAIN_VITE_R2_ACCESS_KEY_ID
  const secretAccessKey =
    env.MAIN_VITE_R2_SECRET_ACCESS_KEY || process.env.MAIN_VITE_R2_SECRET_ACCESS_KEY
  const bucketName = env.MAIN_VITE_R2_BUCKET_NAME || process.env.MAIN_VITE_R2_BUCKET_NAME
  const publicBaseUrl = env.MAIN_VITE_R2_PUBLIC_BASE_URL || process.env.MAIN_VITE_R2_PUBLIC_BASE_URL
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicBaseUrl) return null
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    publicBaseUrl: publicBaseUrl.replace(/\/+$/, '')
  }
}

/**
 * All five settings, the public base URL included: an upload nobody can
 * address is bytes the notes can never point at.
 */
export function isR2Configured(): boolean {
  return readConfig() !== null
}

export function publicUrlForKey(key: string): string | null {
  const config = readConfig()
  return config ? `${config.publicBaseUrl}/${key}` : null
}

/**
 * Where a clip's still is filed: the clip's own key moved to the poster
 * corner and renamed to what it now is. Derived, never minted, so either can
 * be read from the other. `null` outside the library.
 */
export function posterKeyFor(mediaKey: string): string | null {
  if (!mediaKey.startsWith(MEDIA_PREFIX)) return null
  const name = mediaKey.slice(MEDIA_PREFIX.length)
  const dot = name.lastIndexOf('.')
  return `${POSTER_PREFIX}${dot === -1 ? name : name.slice(0, dot)}.jpg`
}

let cached: { signature: string; client: S3Client } | null = null

function connection(): { client: S3Client; bucket: string } {
  const config = readConfig()
  if (!config) throw new Error('R2 is not configured')
  const signature = `${config.accountId}|${config.accessKeyId}|${config.secretAccessKey}`
  if (cached?.signature !== signature) {
    cached = {
      signature,
      client: new S3Client({
        region: 'auto',
        endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
      })
    }
  }
  return { client: cached.client, bucket: config.bucketName }
}

export async function putObject(
  key: string,
  bytes: Uint8Array,
  contentType: string
): Promise<void> {
  const { client, bucket } = connection()
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: bytes,
      ContentType: contentType,
      CacheControl: IMMUTABLE_CACHE_CONTROL
    })
  )
}

export interface R2ObjectHead {
  size: number
  contentType: string
  /** The whole map, for a caller with facts of its own to read. */
  metadata: Record<string, string>
  alt?: string
  /** The display name, editable without moving the object. */
  filename?: string
  /** Strings, because object metadata is a map of them; the caller parses. */
  width?: string
  height?: string
  /** The still's URL, on a clip that has one. */
  poster?: string
}

export async function headObject(key: string): Promise<R2ObjectHead> {
  const { client, bucket } = connection()
  const response = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
  return {
    size: response.ContentLength ?? 0,
    contentType: response.ContentType ?? 'application/octet-stream',
    metadata: response.Metadata ?? {},
    alt: response.Metadata?.alt,
    filename: response.Metadata?.filename,
    width: response.Metadata?.width,
    height: response.Metadata?.height,
    poster: response.Metadata?.poster
  }
}

/**
 * Patch part of an object's metadata. S3 has no partial update — only a
 * self-copy with REPLACE, which swaps the whole map and resets the system
 * headers — so read first and re-send merged, carrying the content type.
 */
export async function updateObjectMetadata(
  key: string,
  patch: Record<string, string>
): Promise<void> {
  const { client, bucket } = connection()
  const current = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: `${bucket}/${key}`,
      Key: key,
      ContentType: current.ContentType,
      CacheControl: IMMUTABLE_CACHE_CONTROL,
      Metadata: { ...current.Metadata, ...patch },
      MetadataDirective: 'REPLACE'
    })
  )
}

export async function listMediaKeys(prefix = MEDIA_PREFIX): Promise<string[]> {
  const { client, bucket } = connection()
  const keys: string[] = []
  let continuationToken: string | undefined

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken
      })
    )
    for (const item of response.Contents ?? []) {
      if (item.Key && MEDIA_KEY_PATTERN.test(item.Key)) keys.push(item.Key)
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
  } while (continuationToken)

  return keys.sort((a, b) => b.localeCompare(a))
}

export async function deleteObject(key: string): Promise<void> {
  const { client, bucket } = connection()
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}
