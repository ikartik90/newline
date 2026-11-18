import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it } from 'vitest'
import { huggingFaceHubDir, locateGemmaModel, type LocatorEnv } from '../model-locator'
import { writeModel } from './gguf-fixture'

let home: string
let env: LocatorEnv

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'locator-'))
  env = { home, platform: 'darwin', vars: {} }
})

describe('huggingFaceHubDir', () => {
  it('follows HF_HUB_CACHE, then HF_HOME, then the XDG cache, then ~/.cache', () => {
    expect(huggingFaceHubDir(env)).toBe(join(home, '.cache', 'huggingface', 'hub'))
    expect(huggingFaceHubDir({ ...env, vars: { XDG_CACHE_HOME: '/x' } })).toBe(
      join('/x', 'huggingface', 'hub')
    )
    expect(huggingFaceHubDir({ ...env, vars: { HF_HOME: '/h' } })).toBe(join('/h', 'hub'))
    expect(huggingFaceHubDir({ ...env, vars: { HF_HOME: '/h', HF_HUB_CACHE: '/c' } })).toBe('/c')
  })
})

describe('locateGemmaModel', () => {
  it('finds nothing on a machine without the model', async () => {
    expect(await locateGemmaModel(env)).toBeNull()
  })

  it('finds a snapshot in the Hugging Face cache, through its blob symlink', async () => {
    const repo = join(home, '.cache/huggingface/hub/models--unsloth--gemma-4-E4B-it-GGUF')
    const blob = writeModel(join(repo, 'blobs', 'abc123'))
    const snapshot = join(repo, 'snapshots', 'c0ffee')
    mkdirSync(snapshot, { recursive: true })
    symlinkSync(blob, join(snapshot, 'gemma-4-E4B-it-Q4_K_M.gguf'))
    writeModel(join(snapshot, 'mmproj-BF16.gguf'))

    expect(await locateGemmaModel(env)).toEqual({
      path: join(snapshot, 'gemma-4-E4B-it-Q4_K_M.gguf'),
      source: 'huggingface'
    })
  })

  it('finds LM Studio’s publisher/repo/file layout, in either of its homes', async () => {
    const path = writeModel(
      join(
        home,
        '.lmstudio/models/lmstudio-community/gemma-4-E4B-it-GGUF/gemma-4-E4B-it-Q4_K_M.gguf'
      )
    )
    expect(await locateGemmaModel(env)).toEqual({ path, source: 'lm-studio' })
  })

  it('finds an Ollama e4b tag through its manifest', async () => {
    const models = join(home, '.ollama/models')
    const blob = writeModel(join(models, 'blobs', 'sha256-feed'))
    const manifest = join(models, 'manifests/registry.ollama.ai/library/gemma4')
    mkdirSync(manifest, { recursive: true })
    writeFileSync(
      join(manifest, 'e4b'),
      JSON.stringify({
        layers: [
          { mediaType: 'application/vnd.ollama.image.template', digest: 'sha256:beef' },
          { mediaType: 'application/vnd.ollama.image.model', digest: 'sha256:feed' }
        ]
      })
    )
    expect(await locateGemmaModel(env)).toEqual({ path: blob, source: 'ollama' })
  })

  it('honours OLLAMA_MODELS, and ignores tags that are not e4b', async () => {
    const models = join(home, 'elsewhere')
    writeModel(join(models, 'blobs', 'sha256-0001'))
    const manifest = join(models, 'manifests/registry.ollama.ai/library/gemma4')
    mkdirSync(manifest, { recursive: true })
    const layers = JSON.stringify({
      layers: [{ mediaType: 'application/vnd.ollama.image.model', digest: 'sha256:0001' }]
    })
    writeFileSync(join(manifest, 'e2b'), layers)
    expect(await locateGemmaModel({ ...env, vars: { OLLAMA_MODELS: models } })).toBeNull()

    writeFileSync(join(manifest, 'e4b-it-q4_K_M'), layers)
    expect(await locateGemmaModel({ ...env, vars: { OLLAMA_MODELS: models } })).toEqual({
      path: join(models, 'blobs', 'sha256-0001'),
      source: 'ollama'
    })
  })

  it('finds llama.cpp’s download cache and node-llama-cpp’s models folder', async () => {
    const cached = writeModel(
      join(home, 'Library/Caches/llama.cpp/ggml-org_gemma-4-E4B-it-GGUF_gemma-4-E4B-it-Q4_0.gguf')
    )
    expect(await locateGemmaModel(env)).toEqual({ path: cached, source: 'llama.cpp' })

    const llamaEnv: LocatorEnv = {
      home: mkdtempSync(join(tmpdir(), 'locator-')),
      platform: 'linux',
      vars: {}
    }
    const own = writeModel(
      join(llamaEnv.home, '.node-llama-cpp/models/hf_gemma-4-E4B-it.Q4_K_M.gguf')
    )
    expect(await locateGemmaModel(llamaEnv)).toEqual({ path: own, source: 'node-llama-cpp' })
  })

  it('passes over a file that is named right but is not a Gemma 4 GGUF', async () => {
    writeModel(join(home, '.lmstudio/models/x/y/gemma-4-E4B-it-Q4_K_M.gguf'), 'llama')
    const repo = join(home, '.lmstudio/models/x/z')
    mkdirSync(repo, { recursive: true })
    writeFileSync(join(repo, 'gemma-4-E4B-it-Q8_0.gguf'), 'truncated')
    expect(await locateGemmaModel(env)).toBeNull()
  })

  it('prefers a 4-bit build, then the smaller file', async () => {
    const dir = join(home, '.lmstudio/models/lmstudio-community/gemma-4-E4B-it-GGUF')
    writeModel(join(dir, 'gemma-4-E4B-it-Q8_0.gguf'))
    writeModel(join(dir, 'gemma-4-E4B-it-Q4_K_S.gguf'), 'gemma4', 64)
    const q4 = writeModel(join(dir, 'gemma-4-E4B-it-Q4_K_M.gguf'))
    expect((await locateGemmaModel(env))?.path).toBe(q4)
  })

  it('prefers the Hugging Face cache, where Newline downloads to, over other apps', async () => {
    writeModel(join(home, '.lmstudio/models/a/b/gemma-4-E4B-it-Q4_K_M.gguf'))
    const hf = writeModel(
      join(
        home,
        '.cache/huggingface/hub/models--google--gemma-4-E4B-it-qat-q4_0-gguf/snapshots/1/gemma-4-E4B_q4_0-it.gguf'
      )
    )
    expect(await locateGemmaModel(env)).toEqual({ path: hf, source: 'huggingface' })
  })
})
