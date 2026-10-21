export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export function getFileNameFromUrl(value: string): string {
  try {
    const url = new URL(value)
    const segments = url.pathname.split('/').filter(Boolean)
    const name = segments.at(-1)
    return name ? decodeURIComponent(name) : '未命名媒体'
  } catch {
    return '未命名媒体'
  }
}

export function getMediaExtension(value: string): string | undefined {
  try {
    const pathname = new URL(value).pathname
    const filename = pathname.split('/').at(-1) ?? ''
    const extension = filename.split('.').at(-1)?.toLowerCase()
    return extension || undefined
  } catch {
    return undefined
  }
}
