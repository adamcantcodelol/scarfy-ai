import type { AppMeta, DetectionBatch, Outfit, Preferences, Settings, WardrobeItem } from '../types'

const DB_NAME = 'scarfy-ai'
const DB_VERSION = 1

interface KvRecord {
  key: string
  value: unknown
  updatedAt: number
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('wardrobe')) db.createObjectStore('wardrobe', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('outfits')) db.createObjectStore('outfits', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('batches')) db.createObjectStore('batches', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      dbPromise = null
      reject(request.error ?? new Error('Unable to open local database'))
    }
    request.onblocked = () => {
      dbPromise = null
      reject(new Error('Local database is blocked by another tab'))
    }
  })
  return dbPromise
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

async function tx<T>(storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode)
    const store = transaction.objectStore(storeName)
    const request = fn(store)
    transaction.oncomplete = () => resolve(request ? request.result : undefined)
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
  })
}

export async function getAllWardrobe(): Promise<WardrobeItem[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('wardrobe', 'readonly')
    const request = transaction.objectStore('wardrobe').getAll()
    request.onsuccess = () => resolve((request.result as WardrobeItem[]).sort((a, b) => b.createdAt - a.createdAt))
    request.onerror = () => reject(request.error)
  })
}

export async function putWardrobeItem(item: WardrobeItem): Promise<void> {
  await tx('wardrobe', 'readwrite', (store) => store.put(item))
}

export async function deleteWardrobeItem(id: string): Promise<void> {
  await tx('wardrobe', 'readwrite', (store) => store.delete(id))
}

export async function clearWardrobe(): Promise<void> {
  await tx('wardrobe', 'readwrite', (store) => store.clear())
}

export async function getAllOutfits(): Promise<Outfit[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('outfits', 'readonly')
    const request = transaction.objectStore('outfits').getAll()
    request.onsuccess = () => resolve((request.result as Outfit[]).sort((a, b) => b.createdAt - a.createdAt))
    request.onerror = () => reject(request.error)
  })
}

export async function putOutfit(outfit: Outfit): Promise<void> {
  await tx('outfits', 'readwrite', (store) => store.put(outfit))
}

export async function deleteOutfit(id: string): Promise<void> {
  await tx('outfits', 'readwrite', (store) => store.delete(id))
}

export async function putBatch(batch: DetectionBatch): Promise<void> {
  await tx('batches', 'readwrite', (store) => store.put(batch))
}

export async function getBatch(id: string): Promise<DetectionBatch | undefined> {
  const db = await openDb()
  return requestToPromise(db.transaction('batches', 'readonly').objectStore('batches').get(id)) as Promise<DetectionBatch | undefined>
}

export async function getAllBatches(): Promise<DetectionBatch[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('batches', 'readonly')
    const request = transaction.objectStore('batches').getAll()
    request.onsuccess = () => resolve((request.result as DetectionBatch[]).sort((a, b) => a.analyzedAt - b.analyzedAt))
    request.onerror = () => reject(request.error)
  })
}

export async function deleteBatch(id: string): Promise<void> {
  await tx('batches', 'readwrite', (store) => store.delete(id))
}

export async function getKv<T>(key: string): Promise<T | undefined> {
  const db = await openDb()
  const record = (await requestToPromise(db.transaction('kv', 'readonly').objectStore('kv').get(key))) as KvRecord | undefined
  return record?.value as T | undefined
}

export async function putKv(key: string, value: unknown): Promise<void> {
  const record: KvRecord = { key, value, updatedAt: Date.now() }
  await tx('kv', 'readwrite', (store) => store.put(record))
}

export async function getPreferences(): Promise<Preferences | undefined> {
  return getKv<Preferences>('preferences')
}

export async function putPreferences(preferences: Preferences): Promise<void> {
  await putKv('preferences', preferences)
}

export async function getSettings(): Promise<Settings | undefined> {
  const settings = await getKv<Omit<Settings, 'apiKey'>>('settings')
  if (!settings) return undefined
  return { ...settings, apiKey: '' } as Settings
}

export async function putSettings(settings: Omit<Settings, 'apiKey'>): Promise<void> {
  await putKv('settings', settings)
}

export async function getRecentOutfitSignatures(): Promise<string[]> {
  return (await getKv<string[]>('recentOutfitSignatures')) ?? []
}

export async function putRecentOutfitSignatures(signatures: string[]): Promise<void> {
  await putKv('recentOutfitSignatures', signatures.slice(-60))
}

export async function getUsage(): Promise<AppMeta['value']> {
  return getKv('usage')
}

export async function putUsage(value: unknown): Promise<void> {
  await putKv('usage', value)
}

export async function clearAllLocalData(): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(['wardrobe', 'outfits', 'batches', 'kv'], 'readwrite')
    transaction.objectStore('wardrobe').clear()
    transaction.objectStore('outfits').clear()
    transaction.objectStore('batches').clear()
    transaction.objectStore('kv').clear()
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}
