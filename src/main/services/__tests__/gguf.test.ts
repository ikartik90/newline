import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { readGgufArchitecture } from '../gguf'

const u32 = (n: number) => {
  const b = Buffer.alloc(4)
  b.writeUInt32LE(n)
  return b
}
const u64 = (n: number) => {
  const b = Buffer.alloc(8)
  b.writeBigUInt64LE(BigInt(n))
  return b
}
const str = (s: string) => Buffer.concat([u64(Buffer.byteLength(s)), Buffer.from(s)])

/** A GGUF v3 header holding the given key/values, in order. */
function gguf(kvs: Buffer[]): Buffer {
  return Buffer.concat([Buffer.from('GGUF'), u32(3), u64(0), u64(kvs.length), ...kvs])
}
const stringKv = (key: string, value: string) => Buffer.concat([str(key), u32(8), str(value)])
const u32Kv = (key: string, value: number) => Buffer.concat([str(key), u32(4), u32(value)])
const arrayKv = (key: string, items: string[]) =>
  Buffer.concat([str(key), u32(9), u32(8), u64(items.length), ...items.map(str)])

const dir = mkdtempSync(join(tmpdir(), 'gguf-'))
function file(name: string, bytes: Buffer): string {
  const path = join(dir, name)
  writeFileSync(path, bytes)
  return path
}

describe('readGgufArchitecture', () => {
  it('reads general.architecture', async () => {
    const path = file('a.gguf', gguf([stringKv('general.architecture', 'gemma4')]))
    expect(await readGgufArchitecture(path)).toBe('gemma4')
  })

  it('skips the keys written before it, arrays included', async () => {
    const path = file(
      'b.gguf',
      gguf([
        u32Kv('general.quantization_version', 2),
        arrayKv('tokenizer.ggml.tokens', ['<pad>', '<eos>']),
        stringKv('general.architecture', 'gemma4')
      ])
    )
    expect(await readGgufArchitecture(path)).toBe('gemma4')
  })

  it('is null for a file that is not GGUF, or ends before saying', async () => {
    expect(await readGgufArchitecture(file('c.bin', Buffer.from('not a model at all')))).toBeNull()
    expect(await readGgufArchitecture(file('d.gguf', gguf([u32Kv('x', 1)])))).toBeNull()
    expect(await readGgufArchitecture(join(dir, 'missing.gguf'))).toBeNull()
  })
})
