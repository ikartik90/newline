import { createHash, type Hash } from 'crypto'
import { createReadStream } from 'fs'
import { mkdir, open, rename, rm, stat, statfs, symlink, writeFile } from 'fs/promises'
import { dirname, join } from 'path'

// ---------------------------------------------------------------------------
// Downloading the model into the Hugging Face hub cache, laid out exactly as
// `huggingface_hub` lays it out — `blobs/<sha256>` holding the bytes and
// `snapshots/<commit>/<file>` pointing at it — so every tool that reads that
// cache sees this copy as its own, and nobody downloads it twice.
// ---------------------------------------------------------------------------

export interface ModelSpec {
  repo: string
  commit: string
  file: string
  sha256: string
  size: number
}

export interface DownloadOptions {
  spec: ModelSpec
  hubDir: string
  platform: NodeJS.Platform
  fetch: (url: string, init?: RequestInit) => Promise<Response>
  onProgress?: (receivedBytes: number, totalBytes: number) => void
  signal?: AbortSignal
  /** Free space on the volume holding `dir`; the real disk's unless a test says otherwise. */
  freeBytes?: (dir: string) => Promise<number>
}

/** Room kept free beyond the model itself, so the download never fills the disk. */
const HEADROOM = 512 * 1024 * 1024

export function modelRepoDir(hubDir: string, repo: string): string {
  return join(hubDir, `models--${repo.split('/').join('--')}`)
}

async function diskFree(dir: string): Promise<number> {
  const info = await statfs(dir)
  return info.bavail * info.bsize
}

async function sizeOf(path: string): Promise<number> {
  return (await stat(path).catch(() => null))?.size ?? 0
}

async function hashInto(hash: Hash, path: string): Promise<void> {
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
}

function gigabytes(n: number): string {
  return `${(n / 1e9).toFixed(1)} GB`
}

/** Fetch the pinned file, resuming a partial one, and resolve to its snapshot path. */
export async function downloadModel({
  spec,
  hubDir,
  platform,
  fetch,
  onProgress,
  signal,
  freeBytes = diskFree
}: DownloadOptions): Promise<string> {
  const repo = modelRepoDir(hubDir, spec.repo)
  const blob = join(repo, 'blobs', spec.sha256)
  const partial = `${blob}.incomplete`
  const snapshot = join(repo, 'snapshots', spec.commit, spec.file)
  await mkdir(dirname(blob), { recursive: true })

  let received = await sizeOf(partial)
  if (received > spec.size) {
    await rm(partial)
    received = 0
  }

  const needed = spec.size - received + HEADROOM
  const free = await freeBytes(dirname(blob))
  if (free < needed) {
    throw new Error(
      `Not enough disk space: the model needs ${gigabytes(needed)} and ${gigabytes(free)} is free.`
    )
  }

  const url = `https://huggingface.co/${spec.repo}/resolve/${spec.commit}/${spec.file}`
  const headers = received > 0 ? { Range: `bytes=${received}-` } : undefined
  const response = await fetch(url, { headers, signal })
  if (response.status !== 200 && response.status !== 206) {
    throw new Error(`The model download failed (HTTP ${response.status}).`)
  }
  if (!response.body) throw new Error('The model download returned nothing.')

  // A server that ignores the Range sends the whole file again.
  const resuming = response.status === 206 && received > 0
  if (!resuming) received = 0
  const hash = createHash('sha256')
  if (resuming) await hashInto(hash, partial)

  const file = await open(partial, resuming ? 'a' : 'w')
  try {
    onProgress?.(received, spec.size)
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      if (signal?.aborted) throw new Error('The model download was aborted.')
      await file.write(chunk)
      hash.update(chunk)
      received += chunk.length
      onProgress?.(received, spec.size)
    }
    if (signal?.aborted) throw new Error('The model download was aborted.')
  } finally {
    await file.close()
  }

  if (received !== spec.size || hash.digest('hex') !== spec.sha256) {
    await rm(partial, { force: true })
    throw new Error('The downloaded model did not match its published checksum. Try again.')
  }

  await rename(partial, blob)
  await mkdir(dirname(snapshot), { recursive: true })
  await rm(snapshot, { force: true })
  if (platform === 'win32') {
    // The cache's own fallback where symlinks need admin rights: the file
    // lives in the snapshot and there is no blob.
    await rename(blob, snapshot)
  } else {
    await symlink(join('..', '..', 'blobs', spec.sha256), snapshot)
  }

  const ref = join(repo, 'refs', 'main')
  if ((await sizeOf(ref)) === 0) {
    await mkdir(dirname(ref), { recursive: true })
    await writeFile(ref, spec.commit)
  }
  return snapshot
}
