import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 关键点（来自 sqlite.org/wasm 官方文档与调研结论）：
//
// 1. 数据库跑在 Worker 里。OPFS 的同步访问句柄 (FileSystemSyncAccessHandle)
//    只在专用 Worker 中可用，主线程拿不到，所以这一条是硬性约束。
// 2. 使用 opfs-sahpool VFS，它不需要 COOP/COEP 响应头（opfs VFS 才需要
//    SharedArrayBuffer，因而需要跨源隔离）。因此这里不配置任何 headers。
// 3. Worker 用 ES module 格式，与 `new Worker(url, { type: 'module' })` 匹配。
//    Vite 的 worker.format 默认是 'iife'，必须显式改掉。
// 4. 端口必须固定：OPFS 按 origin 分区，dev 默认 5173、preview 默认 4173，
//    端口一变就是另一个空数据库，会让人误以为账目丢了。
// 5. optimizeDeps.exclude：这个包自带 .wasm 加载逻辑，交给 Vite 预打包会出问题。
export default defineConfig({
  plugins: [react()],
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  worker: { format: 'es' },
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
})
