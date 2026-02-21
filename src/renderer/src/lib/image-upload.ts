import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { getStorage } from 'firebase/storage'
import { auth } from './firebase'

const storage = getStorage()

export async function uploadImageToGCS(
  localFilename: string,
  fileBlob: Blob
): Promise<string | null> {
  const user = auth.currentUser
  if (!user) return null

  const storagePath = `users/${user.uid}/images/${localFilename}`
  const storageRef = ref(storage, storagePath)

  try {
    await uploadBytes(storageRef, fileBlob)
    return await getDownloadURL(storageRef)
  } catch (err) {
    console.error('[images] upload failed:', err)
    return null
  }
}
