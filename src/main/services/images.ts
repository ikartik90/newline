import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/database'

const imagesDir = () => {
  const dir = join(app.getPath('userData'), 'images')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function saveImageLocally(buffer: Buffer, ext: string): { id: string; localPath: string } {
  const id = uuidv4()
  const filename = `${id}.${ext}`
  const localPath = join(imagesDir(), filename)

  writeFileSync(localPath, buffer)

  return { id, localPath: filename }
}

export function getImagePath(filename: string): string | null {
  const fullPath = join(imagesDir(), filename)
  return existsSync(fullPath) ? fullPath : null
}

export function enqueueImageUpload(imageFilename: string, noteId: string): void {
  const db = getDb()
  db.prepare(
    `INSERT INTO sync_queue (entity_type, entity_id, action, payload, created_at)
     VALUES ('image', ?, 'upload_image', ?, ?)`
  ).run(imageFilename, JSON.stringify({ noteId, filename: imageFilename }), Date.now())
}
