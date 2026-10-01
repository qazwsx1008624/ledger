/**
 * 零依赖静态服务器，用于在受限沙箱内预览构建产物（dist/）。
 *
 * 存在的理由：`vite dev` 与 `vite preview` 都会触发 Vite 在 Windows 上的
 * 一个缺陷 —— optimizeSafeRealPathSync() 里 exec("net use") 未捕获 spawn 异常，
 * 在无法打开命名管道的受限环境下直接抛 EPERM，导致 dev/preview 都起不来。
 * 本脚本只做文件读取，不 spawn 任何子进程，因此不受该问题影响。
 *
 * 用法：node scripts/serve-dist.mjs [端口]
 * 注意：它只伺服已构建的 dist/，改代码后需要重新构建（pnpm build）。
 */
import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const distDir = join(projectRoot, 'dist')
const port = Number(process.argv[2] ?? 5173)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
}

const server = createServer(async (request, response) => {
  const requested = decodeURIComponent((request.url ?? '/').split('?')[0] ?? '/')

  // 防目录穿越：规范化后必须仍在 dist 内
  const candidate = normalize(join(distDir, requested))
  if (!candidate.startsWith(distDir)) {
    response.writeHead(403).end('Forbidden')
    return
  }

  let filePath = candidate
  try {
    const info = await stat(filePath)
    if (info.isDirectory()) filePath = join(filePath, 'index.html')
  } catch {
    filePath = join(distDir, 'index.html')
  }

  try {
    const info = await stat(filePath)
    response.writeHead(200, {
      'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-cache',
    })
    createReadStream(filePath).pipe(response)
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found')
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`演示版已启动：http://localhost:${port}`)
  console.log(`伺服目录：${distDir}`)
})
