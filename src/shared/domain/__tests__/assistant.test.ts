import { describe, expect, it } from 'vitest'
import {
  ASSISTANT_EFFORTS,
  AssistantEffortSchema,
  AssistantMessageSchema,
  AssistantModelCopySchema,
  AssistantUsageSchema,
  EFFORT_THOUGHT_TOKENS,
  AssistantModelStatusSchema,
  GEMMA_MODEL,
  isGemmaModelFile
} from '../assistant'

describe('GEMMA_MODEL', () => {
  it('pins one file of one commit, with the bytes to check it against', () => {
    expect(GEMMA_MODEL.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(GEMMA_MODEL.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(GEMMA_MODEL.size).toBeGreaterThan(1e9)
    expect(isGemmaModelFile(GEMMA_MODEL.file)).toBe(true)
  })
})

describe('isGemmaModelFile', () => {
  it('knows the builds other apps download', () => {
    for (const name of [
      'gemma-4-E4B_q4_0-it.gguf',
      'gemma-4-E4B-it-Q4_K_M.gguf',
      'google_gemma-4-E4B-it-Q6_K.gguf',
      'ggml-org_gemma-4-E4B-it-GGUF_gemma-4-E4B-it-Q4_0.gguf'
    ]) {
      expect(isGemmaModelFile(name), name).toBe(true)
    }
  })

  it('passes over the vision and draft companions, other sizes and other formats', () => {
    for (const name of [
      'mmproj-gemma-4-E4B-it-BF16.gguf',
      'gemma-4-E4B-it-mmproj.gguf',
      'mtp-gemma-4-E4B-it-Q8_0.gguf',
      'gemma-4-E2B-it-Q4_K_M.gguf',
      'gemma-3n-E4B-it-Q4_K_M.gguf',
      'gemma-4-E4B-it-Q4_K_M.gguf.incomplete',
      'gemma-4-E4B-it.safetensors'
    ]) {
      expect(isGemmaModelFile(name), name).toBe(false)
    }
  })
})

describe('AssistantModelStatusSchema', () => {
  it('accepts each state', () => {
    for (const status of [
      { state: 'missing' },
      { state: 'downloading', receivedBytes: 10, totalBytes: 100 },
      { state: 'ready', path: '/m.gguf', source: 'lm-studio' },
      { state: 'error', message: 'Disk full' }
    ]) {
      expect(AssistantModelStatusSchema.parse(status)).toEqual(status)
    }
  })

  it('rejects a source it does not know', () => {
    expect(() =>
      AssistantModelStatusSchema.parse({ state: 'ready', path: '/m', source: 'elsewhere' })
    ).toThrow()
  })
})

describe('AssistantMessageSchema', () => {
  it('holds who said what about which note, and when', () => {
    const message = { id: 'm1', noteId: 'n1', role: 'user', content: 'Hi', createdAt: 1 }
    expect(AssistantMessageSchema.parse(message)).toEqual(message)
    expect(() => AssistantMessageSchema.parse({ ...message, role: 'system' })).toThrow()
  })
})

describe('efforts', () => {
  it('runs low to high, thinking longer at each step and not at all at the lowest', () => {
    expect(ASSISTANT_EFFORTS).toEqual(['low', 'medium', 'high'])
    expect(EFFORT_THOUGHT_TOKENS.low).toBe(0)
    expect(EFFORT_THOUGHT_TOKENS.medium).toBeGreaterThan(0)
    expect(EFFORT_THOUGHT_TOKENS.high).toBeGreaterThan(EFFORT_THOUGHT_TOKENS.medium)
    expect(AssistantEffortSchema.parse('medium')).toBe('medium')
    expect(() => AssistantEffortSchema.parse('max')).toThrow()
  })
})

describe('AssistantUsageSchema', () => {
  it('counts the tokens a request starts with against the window', () => {
    expect(
      AssistantUsageSchema.parse({ usedTokens: 1200, contextTokens: 16384, estimated: true })
    ).toEqual({ usedTokens: 1200, contextTokens: 16384, estimated: true })
    expect(() =>
      AssistantUsageSchema.parse({ usedTokens: -1, contextTokens: 0, estimated: false })
    ).toThrow()
  })
})

describe('AssistantModelCopySchema', () => {
  it('names a copy on disk, its size, its source and whether Newline may delete it', () => {
    const copy = { path: '/m.gguf', source: 'ollama', sizeBytes: 5e9, deletable: false }
    expect(AssistantModelCopySchema.parse(copy)).toEqual(copy)
  })
})
