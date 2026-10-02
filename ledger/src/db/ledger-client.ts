/**
 * Worker 客户端：把 postMessage 包装成可 await 的调用。
 * 主线程只通过这里访问数据库，不直接接触 SQLite。
 */
import type { BindValue, BootstrapData, Request, Response } from './protocol'

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (value: Response) => void; reject: (error: Error) => void }>()

function ensureWorker(): Worker {
  if (worker) return worker

  worker = new Worker(new URL('./ledger.worker.ts', import.meta.url), { type: 'module' })

  worker.onmessage = (event: MessageEvent<Response>) => {
    const entry = pending.get(event.data.id)
    if (!entry) return
    pending.delete(event.data.id)
    entry.resolve(event.data)
  }

  worker.onerror = (event) => {
    // Worker 整体挂掉（例如脚本加载失败）时，所有在途请求都要失败，否则调用方会永久挂起
    const error = new Error(event.message || 'SQLite Worker 异常退出')
    for (const entry of pending.values()) entry.reject(error)
    pending.clear()
    worker = null
  }

  return worker
}

/**
 * build 接收分配好的 id 并返回完整请求。用回调而不是「传对象再补 id」，
 * 是因为对联合类型做 `{ ...request, id }` 会使判别信息丢失，无法通过类型检查。
 */
function send(build: (id: number) => Request): Promise<Response> {
  const id = nextId++
  const target = ensureWorker()

  return new Promise<Response>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    try {
      target.postMessage(build(id))
    } catch (err) {
      pending.delete(id)
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}

async function call(build: (id: number) => Request): Promise<Response> {
  const response = await send(build)
  if (response.error !== undefined) throw new Error(response.error)
  return response
}

/** 打开数据库并建表。可重复调用，只会真正打开一次 */
export async function initLedger(): Promise<void> {
  await call((id) => ({ id, op: 'ping' }))
}

export async function all<T>(sql: string, bind: BindValue[] = []): Promise<T[]> {
  const response = await call((id) => ({ id, op: 'all', sql, bind }))
  return (response.rows ?? []) as T[]
}

export async function get<T>(sql: string, bind: BindValue[] = []): Promise<T | undefined> {
  const response = await call((id) => ({ id, op: 'get', sql, bind }))
  return response.row as T | undefined
}

export async function run(sql: string, bind: BindValue[] = []): Promise<void> {
  await call((id) => ({ id, op: 'run', sql, bind }))
}

/** 执行 INSERT 并返回生成的自增 id */
export async function insert(sql: string, bind: BindValue[] = []): Promise<number> {
  const response = await call((id) => ({ id, op: 'insert', sql, bind }))
  const row = response.row as { id: number } | undefined
  return row?.id ?? 0
}

/** 一次性加载全部数据（分类、账目、预算、备份清单），用于启动与导入后重建缓存 */
export async function bootstrap(): Promise<BootstrapData> {
  const response = await call((id) => ({ id, op: 'bootstrap' }))
  return response.row as BootstrapData
}

/** 记录一次备份到清单，用于启动一致性检查 */
export async function recordBackup(): Promise<{ at: string; count: number }> {
  const response = await call((id) => ({ id, op: 'record_backup' }))
  return response.row as { at: string; count: number }
}

/** 用外部 .sqlite 文件覆盖当前数据库（导入备份），之后需要重新 bootstrap */
export async function importBytes(bytes: Uint8Array): Promise<void> {
  await call((id) => ({ id, op: 'import', bytes }))
}

/** 导出数据库字节，用于备份成 .sqlite 文件 */
export async function exportBytes(): Promise<Uint8Array<ArrayBuffer>> {
  const response = await call((id) => ({ id, op: 'export' }))
  const raw = response.row as Uint8Array
  // Worker 通过 transfer 传来的是独立缓冲区，这里统一成确定拥有 ArrayBuffer 的类型
  return new Uint8Array(raw.buffer as ArrayBuffer)
}
