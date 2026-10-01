import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Vite 与 vitest 默认把缓存和中间产物写到系统临时目录，在受限沙箱内会被拒绝写入。
  // 统一放到工作区内（已在 .gitignore 排除），既不依赖临时目录权限，也不污染版本库。
  cacheDir: '.cache/vite',

  test: {
    // 统计口径的测试是纯逻辑，不依赖浏览器环境，用 node 跑最快
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
})
