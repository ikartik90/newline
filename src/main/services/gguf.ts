import { open } from 'fs/promises'

// Just enough of the GGUF header to tell what model a file is, without
// loading it: the magic, then key/values until `general.architecture`. The
// llama.cpp writers put that key first; the cap keeps a file that buries it
// under the tokenizer from being read whole.

const HEADER_BYTES = 1 << 20

const TYPE_SIZES: Record<number, number> = {
  0: 1, // u8
  1: 1, // i8
  2: 2, // u16
  3: 2, // i16
  4: 4, // u32
  5: 4, // i32
  6: 4, // f32
  7: 1, // bool
  10: 8, // u64
  11: 8, // i64
  12: 8 // f64
}
const STRING = 8
const ARRAY = 9

class Cursor {
  offset = 0
  constructor(private readonly buf: Buffer) {}

  private need(n: number): void {
    if (this.offset + n > this.buf.length) throw new RangeError('GGUF header ran out')
  }
  u32(): number {
    this.need(4)
    const v = this.buf.readUInt32LE(this.offset)
    this.offset += 4
    return v
  }
  u64(): number {
    this.need(8)
    const v = Number(this.buf.readBigUInt64LE(this.offset))
    this.offset += 8
    return v
  }
  string(): string {
    const length = this.u64()
    this.need(length)
    const v = this.buf.toString('utf8', this.offset, this.offset + length)
    this.offset += length
    return v
  }
  skip(type: number): void {
    if (type === STRING) {
      const length = this.u64()
      this.need(length)
      this.offset += length
    } else if (type === ARRAY) {
      const itemType = this.u32()
      const count = this.u64()
      for (let i = 0; i < count; i++) this.skip(itemType)
    } else {
      const size = TYPE_SIZES[type]
      if (size === undefined) throw new RangeError(`Unknown GGUF type ${type}`)
      this.need(size)
      this.offset += size
    }
  }
}

/** The file's `general.architecture` (e.g. `gemma4`), or null if it is not a readable GGUF. */
export async function readGgufArchitecture(path: string): Promise<string | null> {
  let handle
  try {
    handle = await open(path, 'r')
    const buf = Buffer.alloc(HEADER_BYTES)
    const { bytesRead } = await handle.read(buf, 0, HEADER_BYTES, 0)
    const cursor = new Cursor(buf.subarray(0, bytesRead))
    if (bytesRead < 4 || buf.toString('latin1', 0, 4) !== 'GGUF') return null
    cursor.offset = 4
    cursor.u32() // version
    cursor.u64() // tensor count
    const kvCount = cursor.u64()
    for (let i = 0; i < kvCount; i++) {
      const key = cursor.string()
      const type = cursor.u32()
      if (key === 'general.architecture' && type === STRING) return cursor.string()
      cursor.skip(type)
    }
    return null
  } catch {
    return null
  } finally {
    await handle?.close()
  }
}
