import { createHash } from 'crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadModel, type ModelSpec } from '../model-download'

const bytes = Buffer.from('GGUF pretend weights '.repeat(200))
const spec: ModelSpec = {
  repo: 'google/gemma-4-E4B-it-qat-q4_0-gguf',
  commit: 'c'.repeat(40),
  file: 'gemma-4-E4B_q4_0-it.gguf',
  sha256: createHash('sha256').update(bytes).digest('hex'),
  size: bytes.length
}
const repoDir = (hub: string) => join(hub, 'models--google--gemma-4-E4B-it-qat-q4_0-gguf')

/** A fetch that serves `body`, honouring a Range request unless told not to. */
function serve(body: Buffer, { ranges = true, chunk = 512 } = {}) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const range = new Headers(init?.headers).get('range')
    const start = ranges && range ? Number(/bytes=(\d+)-/.exec(range)![1]) : 0
    const rest = body.subarray(start)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < rest.length; i += chunk) controller.enqueue(rest.subarray(i, i + chunk))
        controller.close()
      }
    })
    return new Response(stream, { status: start > 0 ? 206 : 200 })
  })
}

let hub: string
beforeEach(() => {
  hub = mkdtempSync(join(tmpdir(), 'hub-'))
})

describe('downloadModel', () => {
  it('fetches the pinned commit and files it as the Hugging Face cache does', async () => {
    const fetch = serve(bytes)
    const path = await downloadModel({ spec, hubDir: hub, platform: 'darwin', fetch })

    expect(fetch.mock.calls[0][0]).toBe(
      `https://huggingface.co/${spec.repo}/resolve/${spec.commit}/${spec.file}`
    )
    const repo = repoDir(hub)
    expect(path).toBe(join(repo, 'snapshots', spec.commit, spec.file))
    expect(lstatSync(path).isSymbolicLink()).toBe(true)
    expect(readlinkSync(path)).toBe(join('..', '..', 'blobs', spec.sha256))
    expect(readFileSync(path)).toEqual(bytes)
    expect(readFileSync(join(repo, 'refs', 'main'), 'utf8')).toBe(spec.commit)
    expect(existsSync(join(repo, 'blobs', `${spec.sha256}.incomplete`))).toBe(false)
  })

  it('reports progress as the bytes land', async () => {
    const onProgress = vi.fn()
    await downloadModel({ spec, hubDir: hub, platform: 'darwin', fetch: serve(bytes), onProgress })
    expect(onProgress).toHaveBeenLastCalledWith(bytes.length, bytes.length)
    expect(onProgress.mock.calls.length).toBeGreaterThan(2)
  })

  it('resumes a partial download with a Range request', async () => {
    const blobs = join(repoDir(hub), 'blobs')
    mkdirSync(blobs, { recursive: true })
    writeFileSync(join(blobs, `${spec.sha256}.incomplete`), bytes.subarray(0, 1000))
    const fetch = serve(bytes)

    const path = await downloadModel({ spec, hubDir: hub, platform: 'darwin', fetch })
    expect(new Headers(fetch.mock.calls[0][1]?.headers).get('range')).toBe('bytes=1000-')
    expect(readFileSync(path)).toEqual(bytes)
  })

  it('starts over when the server ignores the Range request', async () => {
    const blobs = join(repoDir(hub), 'blobs')
    mkdirSync(blobs, { recursive: true })
    writeFileSync(join(blobs, `${spec.sha256}.incomplete`), bytes.subarray(0, 1000))

    const path = await downloadModel({
      spec,
      hubDir: hub,
      platform: 'darwin',
      fetch: serve(bytes, { ranges: false })
    })
    expect(readFileSync(path)).toEqual(bytes)
  })

  it('refuses bytes that do not match the pinned digest, and keeps nothing', async () => {
    const wrong = Buffer.from(bytes)
    wrong[10] = 0
    await expect(
      downloadModel({ spec, hubDir: hub, platform: 'darwin', fetch: serve(wrong) })
    ).rejects.toThrow(/did not match/)
    expect(existsSync(join(repoDir(hub), 'blobs', `${spec.sha256}.incomplete`))).toBe(false)
    expect(existsSync(join(repoDir(hub), 'snapshots'))).toBe(false)
  })

  it('raises the server’s refusal', async () => {
    const fetch = vi.fn(async () => new Response('nope', { status: 503 }))
    await expect(downloadModel({ spec, hubDir: hub, platform: 'darwin', fetch })).rejects.toThrow(
      /503/
    )
  })

  it('stops when aborted, keeping what landed for next time', async () => {
    const controller = new AbortController()
    const onProgress = vi.fn((received: number) => {
      if (received >= 1024) controller.abort()
    })
    await expect(
      downloadModel({
        spec,
        hubDir: hub,
        platform: 'darwin',
        fetch: serve(bytes),
        onProgress,
        signal: controller.signal
      })
    ).rejects.toThrow(/abort/i)
    const partial = join(repoDir(hub), 'blobs', `${spec.sha256}.incomplete`)
    expect(readFileSync(partial).length).toBeGreaterThanOrEqual(1024)
  })

  it('refuses up front when the disk cannot hold the rest', async () => {
    const fetch = serve(bytes)
    await expect(
      downloadModel({ spec, hubDir: hub, platform: 'darwin', fetch, freeBytes: async () => 10 })
    ).rejects.toThrow(/space/)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('places the file itself in the snapshot on Windows, as the cache does without symlinks', async () => {
    const path = await downloadModel({ spec, hubDir: hub, platform: 'win32', fetch: serve(bytes) })
    expect(lstatSync(path).isSymbolicLink()).toBe(false)
    expect(readFileSync(path)).toEqual(bytes)
  })
})
