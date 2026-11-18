import { mkdirSync, writeFileSync } from 'fs'
import { dirname } from 'path'

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

/** The smallest file `readGgufArchitecture` takes for a model of `architecture`. */
export function ggufBytes(architecture: string): Buffer {
  return Buffer.concat([
    Buffer.from('GGUF'),
    u32(3),
    u64(0),
    u64(1),
    str('general.architecture'),
    u32(8),
    str(architecture)
  ])
}

/** Write a stand-in model file, making its folders. */
export function writeModel(path: string, architecture = 'gemma4', padding = 0): string {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, Buffer.concat([ggufBytes(architecture), Buffer.alloc(padding)]))
  return path
}
