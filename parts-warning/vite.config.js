import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 关键：base 写成 /<仓库名>/
export default defineConfig({
  base: '/parts-alert/',
  plugins: [vue()],
  // 关键：把构建产物输出到仓库的 docs 目录，便于 Pages 指向 /docs
  build: {
    outDir: '../docs',
    emptyOutDir: true
  }
})
