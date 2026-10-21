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
  it('shows search first and continues the import flow after selecting a result', async () => {
    mocks.search.mockResolvedValue({
      results: [{ title: '庆余年 4K', tokenUrl: '/token', sourceType: 0 }],
      completed: true,
    })
    mocks.resolve.mockResolvedValue('https://pan.quark.cn/s/abc?pwd=z9x8')

    const view = mountView()
    expect(view.find('.resource-search__input').exists()).toBe(true)
    expect(view.find('#manual-import-panel').exists()).toBe(false)

    await view.get('.resource-search__input').setValue('庆余年')
    await view.get('.resource-search__form').trigger('submit')
    await flushPromises()

    expect(mocks.search).toHaveBeenCalledWith('庆余年', expect.anything())
    expect(view.get('.resource-search__result').text()).toContain('庆余年 4K')

    await view.get('.resource-search__result').trigger('click')
    await flushPromises()

    expect(mocks.resolve).toHaveBeenCalledWith(
      { title: '庆余年 4K', tokenUrl: '/token', sourceType: 0 },
      expect.anything(),
    )
    expect(mocks.push).toHaveBeenCalledWith({
      name: 'share-browser',
      query: {
        url: 'https://pan.quark.cn/s/abc?pwd=z9x8',
        code: 'z9x8',
        title: '庆余年 4K',
      },
    })
  })

  it('keeps the manual link and access-code flow behind the secondary entry', async () => {
    const view = mountView()

    expect(view.find('#share-input').exists()).toBe(false)
    await view.get('.manual-import__toggle').trigger('click')

    await view.get('#share-input').setValue('测试视频 https://pan.quark.cn/s/manual 提取码: ab12')
    await flushPromises()

    expect((view.get('#code-input').element as HTMLInputElement).value).toBe('ab12')
    expect(view.text()).toContain('夸克分享可直接播放')

    await view.get('.manual-import__panel').trigger('submit')
    await flushPromises()

    expect(mocks.push).toHaveBeenCalledWith({
      name: 'share-browser',
      query: {
        url: 'https://pan.quark.cn/s/manual',
        code: 'ab12',
        title: '测试视频',
      },
    })
  })

  it('reports a resolve failure without leaving the search page', async () => {
    mocks.search.mockResolvedValue({
      results: [{ title: '失效资源', tokenUrl: '/expired', sourceType: 0 }],
      completed: true,
    })
    mocks.resolve.mockRejectedValue(new Error('线路暂不可用'))

    const view = mountView()
    await view.get('.resource-search__input').setValue('失效资源')
    await view.get('.resource-search__form').trigger('submit')
    await flushPromises()
    await view.get('.resource-search__result').trigger('click')
    await flushPromises()

    expect(view.text()).toContain('线路暂不可用')
    expect(view.find('.resource-search__result').exists()).toBe(true)
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('does not reuse an access code from the manual input when selecting a search result', async () => {
    mocks.search.mockResolvedValue({
      results: [{ title: '新资源', tokenUrl: '/new', sourceType: 0 }],
      completed: true,
    })
    mocks.resolve.mockResolvedValue('https://pan.quark.cn/s/new?pwd=new8')

    const view = mountView()
    await view.get('.manual-import__toggle').trigger('click')
    await view.get('#share-input').setValue('https://pan.quark.cn/s/old 提取码: old8')
    await view.get('.resource-search__input').setValue('新资源')
    await view.get('.resource-search__form').trigger('submit')
    await flushPromises()
    await view.get('.resource-search__result').trigger('click')
    await flushPromises()

    expect(mocks.push).toHaveBeenCalledWith({
      name: 'share-browser',
      query: {
        url: 'https://pan.quark.cn/s/new?pwd=new8',
        code: 'new8',
        title: '新资源',
      },
    })
  })
})
