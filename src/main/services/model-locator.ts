import { readdir, readFile, stat } from 'fs/promises'
import { join } from 'path'
import { isGemmaModelFile, type ModelSource } from '@shared/domain/assistant'
import { readGgufArchitecture } from './gguf'

// ---------------------------------------------------------------------------
// Finding a Gemma 4 E4B another app already downloaded, so nobody keeps two
// 5 GB copies. Each app files its models its own way; these are the layouts
// and the environment overrides each one documents. Newline's own download
// goes into the Hugging Face cache (see model-download.ts), which is why that
// is searched first — and why other tools can find ours in turn.
// ---------------------------------------------------------------------------

export interface LocatorEnv {
  home: string
  platform: NodeJS.Platform
  vars: Record<string, string | undefined>
}

export interface LocatedModel {
  path: string
  source: ModelSource
}

const ARCHITECTURE = 'gemma4'
const OLLAMA_MODEL_LAYER = 'application/vnd.ollama.image.model'

function cacheHome({ home, vars }: LocatorEnv): string {
  return vars.XDG_CACHE_HOME || join(home, '.cache')
}

/** The Hugging Face hub cache, as `huggingface_hub` resolves it. */
export function huggingFaceHubDir(env: LocatorEnv): string {
  const { vars } = env
  if (vars.HF_HUB_CACHE) return vars.HF_HUB_CACHE
  if (vars.HF_HOME) return join(vars.HF_HOME, 'hub')
  return join(cacheHome(env), 'huggingface', 'hub')
}

function llamaCppCacheDir(env: LocatorEnv): string {
  const { home, platform, vars } = env
  if (vars.LLAMA_CACHE) return vars.LLAMA_CACHE
  if (platform === 'darwin') return join(home, 'Library', 'Caches', 'llama.cpp')
  if (platform === 'win32') {
    return join(vars.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'llama.cpp')
  }
  return join(cacheHome(env), 'llama.cpp')
}

async function entries(dir: string): Promise<string[]> {
  try {
    return await readdir(dir)
  } catch {
    return []
  }
}

/** Model files under `dir`, at most `depth` folders down; symlinks are followed. */
async function modelFiles(dir: string, depth: number): Promise<string[]> {
  const found: string[] = []
  for (const name of await entries(dir)) {
    const path = join(dir, name)
    const info = await stat(path).catch(() => null)
    if (!info) continue
    if (info.isDirectory() && depth > 0) found.push(...(await modelFiles(path, depth - 1)))
    else if (info.isFile() && isGemmaModelFile(name)) found.push(path)
  }
  return found
}

async function huggingFaceCandidates(env: LocatorEnv): Promise<string[]> {
  const hub = huggingFaceHubDir(env)
  const repos = (await entries(hub)).filter((name) => /^models--.*gemma-4-e4b/i.test(name))
  const found: string[] = []
  for (const repo of repos) found.push(...(await modelFiles(join(hub, repo, 'snapshots'), 2)))
  return found
}

async function lmStudioCandidates({ home }: LocatorEnv): Promise<string[]> {
  const roots = [join(home, '.lmstudio', 'models'), join(home, '.cache', 'lm-studio', 'models')]
  const found: string[] = []
  for (const root of roots) found.push(...(await modelFiles(root, 2)))
  return found
}

async function ollamaCandidates({ home, vars }: LocatorEnv): Promise<string[]> {
  const models = vars.OLLAMA_MODELS || join(home, '.ollama', 'models')
  const tags = join(models, 'manifests', 'registry.ollama.ai', 'library', 'gemma4')
  const found: string[] = []
  for (const tag of await entries(tags)) {
    if (!/^e4b/i.test(tag)) continue
    try {
      const manifest = JSON.parse(await readFile(join(tags, tag), 'utf8')) as {
        layers?: { mediaType?: string; digest?: string }[]
      }
      const layer = manifest.layers?.find((l) => l.mediaType === OLLAMA_MODEL_LAYER)
      if (layer?.digest) found.push(join(models, 'blobs', layer.digest.replace(':', '-')))
    } catch {
      // A manifest Ollama is still writing, or one in a shape it no longer uses.
    }
  }
  return found
}

async function flatCandidates(dir: string): Promise<string[]> {
  return modelFiles(dir, 0)
}

const SEARCHES: [ModelSource, (env: LocatorEnv) => Promise<string[]>][] = [
  ['huggingface', huggingFaceCandidates],
  ['lm-studio', lmStudioCandidates],
  ['ollama', ollamaCandidates],
  ['llama.cpp', (env) => flatCandidates(llamaCppCacheDir(env))],
  ['node-llama-cpp', (env) => flatCandidates(join(env.home, '.node-llama-cpp', 'models'))]
]

/** 4-bit builds first — the size this app is tuned for — then the smaller file. */
async function preferred(paths: string[]): Promise<string[]> {
  const sized = await Promise.all(
    paths.map(async (path) => ({ path, size: (await stat(path)).size }))
  )
  const rank = (path: string) => (/q4/i.test(path) ? 0 : 1)
  return sized.sort((a, b) => rank(a.path) - rank(b.path) || a.size - b.size).map((s) => s.path)
}

/** The first Gemma 4 E4B on disk, checked by its own header, or null. */
export async function locateGemmaModel(env: LocatorEnv): Promise<LocatedModel | null> {
  for (const [source, search] of SEARCHES) {
    for (const path of await preferred(await search(env))) {
      if ((await readGgufArchitecture(path)) === ARCHITECTURE) return { path, source }
    }
  }
  return null
}
