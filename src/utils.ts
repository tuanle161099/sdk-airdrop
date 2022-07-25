import { CID } from 'multiformats'

export const toUnitTime = (time: number): number => {
  const unitDate = new Date(time).toUTCString()
  const unitTime = new Date(unitDate).getTime()
  return unitTime
}

export const getCID = (digest: number[]) => {
  const v0Prefix = new Uint8Array([18, 32])
  const v0Digest = new Uint8Array(v0Prefix.length + digest?.length)
  v0Digest.set(v0Prefix) // multicodec + length
  v0Digest.set(digest, v0Prefix.length)
  const cid = CID.decode(v0Digest)
  return cid.toString()
}

export const isRevoke = (endedAt: number) => {
  if (!endedAt) return false
  const CURRENT_TIME = Date.now()

  if (endedAt < CURRENT_TIME) return true

  return false
}
