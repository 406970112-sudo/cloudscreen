import { Capacitor } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'
import {
  BackgroundColor,
  CloseAction,
  InAppBrowser,
  ToolBarType,
} from '@capgo/capacitor-inappbrowser'
import { getSecureValue, removeSecureValue, setSecureValue } from './secureStore'

const QUARK_COOKIE_KEY = 'quark.web.cookie.v1'
const QUARK_LOGIN_URL = 'https://pan.quark.cn/'
const QUARK_DESKTOP_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
const COOKIE_URLS = [
  'https://pan.quark.cn/',
  'https://drive.quark.cn/',
  'https://drive-pc.quark.cn/',
  'https://drive-social-api.quark.cn/',
]
const QUARK_DOWNLOAD_LANDING_HOSTS = new Set(['h5.sm.cn', 'download.quark.cn'])

export class QuarkLoginPageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QuarkLoginPageError'
  }
}

export function isQuarkDownloadLandingUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return QUARK_DOWNLOAD_LANDING_HOSTS.has(parsed.hostname.toLowerCase())
      || (parsed.hostname === 'h5.sm.cn' && /\/blm\/mobile-entry\//i.test(parsed.pathname))
  } catch {
    return false
  }
}

function serializeCookies(cookieGroups: Array<Record<string, string>>): string {
  const merged = new Map<string, string>()
  for (const group of cookieGroups) {
    for (const [name, value] of Object.entries(group)) {
      if (name && value && !merged.has(name)) merged.set(name, value)
    }
  }
  return [...merged.entries()].map(([name, value]) => `${name}=${value}`).join('; ')
}

export function isQuarkCookie(cookie: string | undefined): boolean {
  if (!cookie) return false
  return /(?:^|;\s*)__(?:uid|kps)=/.test(cookie)
}

export async function getQuarkCookie(): Promise<string | undefined> {
  const cookie = await getSecureValue(QUARK_COOKIE_KEY)
  return isQuarkCookie(cookie) ? cookie : undefined
}

export async function hasQuarkLogin(): Promise<boolean> {
  return Boolean(await getQuarkCookie())
}

export async function clearQuarkLogin(): Promise<void> {
  await removeSecureValue(QUARK_COOKIE_KEY)
  if (Capacitor.isNativePlatform()) {
    for (const url of COOKIE_URLS) {
      try {
        await InAppBrowser.clearCookies({ url })
      } catch {
        // Clearing an absent cookie domain is harmless.
      }
    }
  }
}

async function collectBrowserCookies(): Promise<string> {
  const groups: Array<Record<string, string>> = []
  for (const url of COOKIE_URLS) {
    try {
      groups.push(await InAppBrowser.getCookies({ url, includeHttpOnly: true }))
    } catch {
      // A cookie domain may be absent before the first request to that host.
    }
  }
  return serializeCookies(groups)
}

export async function loginToQuark(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('浏览器预览无法安全读取夸克登录 Cookie，请在 Android 真机中登录')
  }

  let browserId = ''
  let closeListener: PluginListenerHandle | undefined
  let urlListener: PluginListenerHandle | undefined
  let loginPageError: QuarkLoginPageError | undefined
  const closed = new Promise<void>((resolve) => {
    void InAppBrowser.addListener('closeEvent', (event) => {
      if (!browserId || !event.id || event.id === browserId) resolve()
    }).then((listener) => {
      closeListener = listener
    })
  })

  const navigationCheck = InAppBrowser.addListener('urlChangeEvent', (event) => {
    if (browserId && event.id && event.id !== browserId) return
    if (!isQuarkDownloadLandingUrl(event.url)) return
    loginPageError = new QuarkLoginPageError(
      '夸克登录页被重定向到客户端下载页，请重试；如果问题持续，请检查网络或夸克登录入口是否发生变化',
    )
    void InAppBrowser.close(event.id ? { id: event.id } : undefined).catch(() => undefined)
  }).then((listener) => {
    urlListener = listener
  })

  try {
    await navigationCheck
    const result = await InAppBrowser.openWebView({
      url: QUARK_LOGIN_URL,
      toolbarType: ToolBarType.NAVIGATION,
      closeAction: CloseAction.CLOSE,
      preferredContentMode: 'desktop',
      customUserAgent: QUARK_DESKTOP_USER_AGENT,
      backgroundColor: BackgroundColor.BLACK,
    })
    browserId = result.id
    await closed
  } finally {
    await closeListener?.remove()
    await urlListener?.remove()
  }

  if (loginPageError) {
    throw loginPageError
  }

  const cookie = await collectBrowserCookies()
  if (!isQuarkCookie(cookie)) {
    throw new Error('没有读取到有效的夸克登录态，请确认已经登录后关闭登录页')
  }
  await setSecureValue(QUARK_COOKIE_KEY, cookie)
}

export async function saveQuarkCookieForDebug(cookie: string): Promise<void> {
  if (!isQuarkCookie(cookie)) {
    throw new Error('Cookie 中未找到 __uid 或 __kps')
  }
  await setSecureValue(QUARK_COOKIE_KEY, cookie.trim())
}
