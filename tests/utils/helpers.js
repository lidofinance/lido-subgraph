export function makeBytesId(txHash = '', logIndex = 0) {
  const idx = Buffer.alloc(4)
  idx.writeUInt32LE(logIndex, 0)
  return txHash + idx.toString('hex')
}
