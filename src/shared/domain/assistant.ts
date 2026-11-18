import { z } from 'zod'

// ---------------------------------------------------------------------------
// The note assistant: Gemma 4 E4B, run on this machine by main. The model is
// never shipped with the app; the user downloads it from the assistant rail,
// or main finds a copy another app already put on disk.
// ---------------------------------------------------------------------------

/**
 * The build Newline downloads: Google's own quantisation-aware 4-bit GGUF,
 * pinned to one commit so the bytes can be checked against a known digest.
 */
export const GEMMA_MODEL = {
  label: 'Gemma 4 E4B',
  repo: 'google/gemma-4-E4B-it-qat-q4_0-gguf',
  commit: '4b4a2c1d584be7264f87aac328a1bc739ce81b6c',
  file: 'gemma-4-E4B_q4_0-it.gguf',
  sha256: '676c35070db6dbe52f93e9c864ee0fba4eddea94b9c875d9cb10daff453fbaee',
  size: 5_154_941_280
} as const

/**
 * Whether a file name is a Gemma 4 E4B language model, as Google, LM Studio,
 * unsloth, bartowski and ggml-org name theirs. The vision projector (mmproj)
 * and draft model (mtp) published beside it are not.
 */
export function isGemmaModelFile(name: string): boolean {
  return /gemma-4-E4B/i.test(name) && /\.gguf$/i.test(name) && !/mmproj|mtp/i.test(name)
}

/** Where the model on disk came from: our own download, or another app's. */
export const MODEL_SOURCES = [
  'huggingface',
  'lm-studio',
  'ollama',
  'llama.cpp',
  'node-llama-cpp'
] as const

export const ModelSourceSchema = z.enum(MODEL_SOURCES)
export type ModelSource = z.infer<typeof ModelSourceSchema>

export const AssistantModelStatusSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('missing') }),
  z.object({
    state: z.literal('downloading'),
    receivedBytes: z.number().nonnegative(),
    totalBytes: z.number().positive()
  }),
  z.object({ state: z.literal('ready'), path: z.string().min(1), source: ModelSourceSchema }),
  z.object({ state: z.literal('error'), message: z.string() })
])
export type AssistantModelStatus = z.infer<typeof AssistantModelStatusSchema>

export const AssistantRoleSchema = z.enum(['user', 'assistant'])
export type AssistantRole = z.infer<typeof AssistantRoleSchema>

/** One turn of a note's conversation. Kept on this device only; never synced. */
export const AssistantMessageSchema = z.object({
  id: z.string().min(1),
  noteId: z.string().min(1),
  role: AssistantRoleSchema,
  content: z.string(),
  createdAt: z.number()
})
export type AssistantMessage = z.infer<typeof AssistantMessageSchema>

/** A piece of a reply as it is generated, sent from main while `send` runs. */
export interface AssistantChunk {
  requestId: string
  text: string
}
