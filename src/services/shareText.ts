import { isHttpUrl } from '../lib/url'
import type { ShareInput } from '../types/domain'

const URL_PATTERN = /https?:\/\/[^\s<>"'）)】\]]+/i
const CODE_PATTERNS = [
  /(?:提取码|访问码|分享码|密码|口令)\s*[:：=]?\s*([a-zA-Z0-9]{4,12})/i,
  /[?&](?:pwd|password|code)=([^&#\s]+)/i,
]

function trimUrlPunctuation(value: string): string {
  return value.replace(/[.,，。;；!！?？\]}>】》]+$/g, '')
}

export function parseShareText(rawText: string): ShareInput {
  const text = rawText.trim()
  if (!text) {
    throw new Error('请粘贴分享链接或媒体地址')
  }

  const match = text.match(URL_PATTERN)
  if (!match?.[0]) {
    throw new Error('没有识别到有效的 http/https 链接')
  }

  const url = trimUrlPunctuation(match[0])
  if (!isHttpUrl(url)) {
    throw new Error('链接格式无效')
  }

  let code: string | undefined
  for (const pattern of CODE_PATTERNS) {
    const codeMatch = text.match(pattern)
    if (codeMatch?.[1]) {
      code = decodeURIComponent(codeMatch[1])
      break
    }
  }

  if (!code) {
    try {
      const parsed = new URL(url)
      code = parsed.searchParams.get('pwd') ?? parsed.searchParams.get('password') ?? parsed.searchParams.get('code') ?? undefined
    } catch {
      code = undefined
    }
  }

  const title = text
    .replace(match[0], ' ')
    .replace(/(?:提取码|访问码|分享码|密码|口令)\s*[:：=]?\s*[a-zA-Z0-9]{4,12}/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return {
    rawText: text,
    url,
    code: code || undefined,
    title: title || undefined,
  }
}
