export function stableHash(input: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function createResourceId(providerId: string, url: string, code?: string): string {
  return `${providerId}-${stableHash(`${url}\u0000${code ?? ''}`)}`
}
