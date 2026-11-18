import type { AssistantMessage } from '@shared/domain/assistant'

// ---------------------------------------------------------------------------
// The one place that touches node-llama-cpp. It is ESM-only and native, so
// it is imported on first use rather than at startup: the app pays for the
// runtime (and the GPU) only once someone asks the assistant something, and
// the model stays loaded after that.
// ---------------------------------------------------------------------------

type NodeLlamaCpp = typeof import('node-llama-cpp')
type Llama = Awaited<ReturnType<NodeLlamaCpp['getLlama']>>
type LlamaModel = Awaited<ReturnType<Llama['loadModel']>>

export interface GenerateOptions {
  modelPath: string
  system: string
  history: Pick<AssistantMessage, 'role' | 'content'>[]
  prompt: string
  onChunk: (text: string) => void
  signal: AbortSignal
}

/** Room for a long note plus a conversation; less where the GPU cannot hold it. */
const CONTEXT_TOKENS = 16_384

let runtime: Promise<{ lib: NodeLlamaCpp; llama: Llama }> | null = null
let loaded: { path: string; model: Promise<LlamaModel> } | null = null

function loadRuntime() {
  runtime ??= (async () => {
    const lib = await import('node-llama-cpp')
    return { lib, llama: await lib.getLlama() }
  })()
  return runtime
}

async function loadModel(path: string): Promise<LlamaModel> {
  if (loaded?.path === path) return loaded.model
  const previous = loaded
  const { llama } = await loadRuntime()
  loaded = { path, model: llama.loadModel({ modelPath: path }) }
  if (previous) void previous.model.then((m) => m.dispose()).catch(() => {})
  try {
    return await loaded.model
  } catch (error) {
    loaded = null
    throw error
  }
}

/** Answer `prompt`, streaming the reply; resolves to what was said, even if stopped. */
export async function generate({
  modelPath,
  system,
  history,
  prompt,
  onChunk,
  signal
}: GenerateOptions): Promise<string> {
  const { lib } = await loadRuntime()
  const model = await loadModel(modelPath)
  const context = await model.createContext({ contextSize: { max: CONTEXT_TOKENS } })
  try {
    const session = new lib.LlamaChatSession({ contextSequence: context.getSequence() })
    session.setChatHistory([
      { type: 'system', text: system },
      ...history.map((m) =>
        m.role === 'user'
          ? { type: 'user' as const, text: m.content }
          : { type: 'model' as const, response: [m.content] }
      )
    ])
    return await session.prompt(prompt, { onTextChunk: onChunk, signal, stopOnAbortSignal: true })
  } finally {
    await context.dispose()
  }
}

/** Free the model and the GPU; the next `generate` loads them again. */
export async function disposeEngine(): Promise<void> {
  const current = loaded
  loaded = null
  if (current) await (await current.model.catch(() => null))?.dispose()
}
