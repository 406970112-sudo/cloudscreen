import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    globals: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/lib/**/*.ts',
        'src/providers/**/*.ts',
        'src/repositories/**/*.ts',
        'src/services/laoerSearch.ts',
        'src/services/shareText.ts',
        'src/services/mediaProbe.ts',
      ],
    },
  },
})
