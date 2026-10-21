import { beforeEach, describe, expect, it, vi } from 'vitest'

type Listener = (event: Record<string, unknown>) => void

const mocks = vi.hoisted(() => ({
  openWebView: vi.fn(),
  close: vi.fn(),
  getCookies: vi.fn(),
  clearCookies: vi.fn(),
  setSecureValue: vi.fn(),
  removeSecureValue: vi.fn(),
  getSecureValue: vi.fn(),
  addListener: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
  },
}))

vi.mock('@capgo/capacitor-inappbrowser', () => ({
  BackgroundColor: { BLACK: 'black' },
  CloseAction: { CLOSE: 'close' },
  ToolBarType: { NAVIGATION: 'navigation' },
  InAppBrowser: {
    openWebView: mocks.openWebView,
    close: mocks.close,
    getCookies: mocks.getCookies,
    clearCookies: mocks.clearCookies,
    addListener: mocks.addListener,
  },
}))

vi.mock('../services/secureStore', () => ({
  getSecureValue: mocks.getSecureValue,
  setSecureValue: mocks.setSecureValue,
  removeSecureValue: mocks.removeSecureValue,
}))

import {
  isQuarkDownloadLandingUrl,
  loginToQuark,
  QuarkLoginPageError,
} from '../services/quarkAuth'

const listeners = new Map<string, Listener>()

function emit(eventName: string, event: Record<string, unknown>): void {
  listeners.get(eventName)?.(event)
}

beforeEach(() => {
  listeners.clear()
  mocks.openWebView.mockReset().mockResolvedValue({ id: 'browser-1' })
  mocks.close.mockReset().mockResolvedValue(undefined)
  mocks.getCookies.mockReset().mockResolvedValue({ __uid: 'user-1' })
  mocks.clearCookies.mockReset().mockResolvedValue(undefined)
  mocks.setSecureValue.mockReset().mockResolvedValue(undefined)
  mocks.removeSecureValue.mockReset().mockResolvedValue(undefined)
  mocks.getSecureValue.mockReset().mockResolvedValue(undefined)
  mocks.addListener.mockReset().mockImplementation(async (eventName: string, listener: Listener) => {
    listeners.set(eventName, listener)
    return { remove: vi.fn().mockResolvedValue(undefined) }
  })
})

describe('Quark web login', () => {
  it('opens the desktop login page instead of the mobile download landing page', async () => {
    const login = loginToQuark()
    await vi.waitFor(() => expect(mocks.openWebView).toHaveBeenCalledTimes(1))

    expect(mocks.openWebView).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://pan.quark.cn/',
      preferredContentMode: 'desktop',
      customUserAgent: expect.stringContaining('Windows NT 10.0'),
    }))

    emit('closeEvent', { id: 'browser-1' })
    await login
    expect(mocks.setSecureValue).toHaveBeenCalledWith('quark.web.cookie.v1', '__uid=user-1')
  })

  it('closes and rejects when Quark redirects login to the download landing page', async () => {
    const login = loginToQuark()
    await vi.waitFor(() => expect(mocks.openWebView).toHaveBeenCalledTimes(1))

    emit('urlChangeEvent', {
      id: 'browser-1',
      url: 'https://h5.sm.cn/blm/mobile-entry-97/index?utm_source=track',
    })
    emit('closeEvent', { id: 'browser-1' })

    await expect(login).rejects.toBeInstanceOf(QuarkLoginPageError)
    expect(mocks.close).toHaveBeenCalledWith({ id: 'browser-1' })
    expect(mocks.setSecureValue).not.toHaveBeenCalled()
  })

  it('recognizes known download hosts without rejecting normal Quark pages', () => {
    expect(isQuarkDownloadLandingUrl('https://h5.sm.cn/blm/mobile-entry-97/index')).toBe(true)
    expect(isQuarkDownloadLandingUrl('https://download.quark.cn/')).toBe(true)
    expect(isQuarkDownloadLandingUrl('https://pan.quark.cn/')).toBe(false)
    expect(isQuarkDownloadLandingUrl('https://pan.quark.cn/s/abc123')).toBe(false)
  })
})
