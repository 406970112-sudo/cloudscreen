import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  search: vi.fn(),
  resolve: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push }),
}))

vi.mock('../services/laoerSearch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/laoerSearch')>()
  return {
    ...actual,
    searchLaoerResources: mocks.search,
    resolveLaoerResource: mocks.resolve,
  }
})

import ImportView from '../views/ImportView.vue'

let wrapper: VueWrapper | undefined

function mountView(): VueWrapper {
  wrapper = mount(ImportView, {
    global: {
      plugins: [createPinia()],
    },
  })
  return wrapper
}

beforeEach(() => {
  mocks.push.mockReset()
  mocks.search.mockReset()
  mocks.resolve.mockReset()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('ImportView resource search', () => {
  it('fills the existing share input after the user selects a search result', async () => {
    mocks.search.mockResolvedValue({
      results: [{ title: '庆余年 4K', tokenUrl: '/token', sourceType: 0 }],
      completed: true,
    })
    mocks.resolve.mockResolvedValue('https://pan.quark.cn/s/abc?pwd=z9x8')

    const view = mountView()
    await view.get('.search-toggle').trigger('click')
    await view.get('.resource-search__input').setValue('庆余年')
    await view.get('.resource-search__submit').trigger('click')
    await flushPromises()

    expect(mocks.search).toHaveBeenCalledWith('庆余年', expect.anything())
    expect(view.get('.resource-search__result').text()).toContain('庆余年 4K')

    await view.get('.resource-search__result').trigger('click')
    await flushPromises()

    expect(mocks.resolve).toHaveBeenCalledWith(
      { title: '庆余年 4K', tokenUrl: '/token', sourceType: 0 },
      expect.anything(),
    )
    expect((view.get('#share-input').element as HTMLTextAreaElement).value)
      .toBe('https://pan.quark.cn/s/abc?pwd=z9x8')
    expect((view.get('#code-input').element as HTMLInputElement).value).toBe('z9x8')
    expect(view.text()).toContain('夸克分享可直接播放')
    expect(view.find('#resource-search-panel').exists()).toBe(false)
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('keeps the existing manual link and access-code flow', async () => {
    const view = mountView()

    await view.get('#share-input').setValue('测试视频 https://pan.quark.cn/s/manual 提取码: ab12')
    await flushPromises()

    expect((view.get('#code-input').element as HTMLInputElement).value).toBe('ab12')
    expect(view.text()).toContain('夸克分享可直接播放')
  })
})
