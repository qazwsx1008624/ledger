/**
 * SQLite 数据层，运行在专用 Web Worker 中。
 *
 * 为什么必须在 Worker 里：OPFS 的同步访问句柄 (FileSystemSyncAccessHandle)
 * 只在专用 Worker 中可用，主线程拿不到。因此主线程通过 postMessage 调用这里的操作。
 *
 * 使用 opfs-sahpool VFS，它不需要 COOP/COEP 响应头。
 * 代价是同一时间只能有一个连接占用数据库：第二个标签页打开会失败，这是该 VFS 的设计而非 bug。
 */
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import type { Request, Response } from './protocol'

/** OPFS 中存放数据库的路径。sahpool VFS 要求绝对路径 */
const DB_FILE = '/ledger.sqlite3'

/** sahpool 池容量。官方要求至少是数据库数的两倍（要算上日志文件），再留临时文件余量 */
const POOL_CAPACITY = 8

type Sqlite3 = Awaited<ReturnType<typeof sqlite3InitModule>>
type Pool = Awaited<ReturnType<Sqlite3['installOpfsSAHPoolVfs']>>
type Db = InstanceType<Pool['OpfsSAHPoolDb']>

interface Opened {
  db: Db
  pool: Pool
}

let opened: Opened | null = null

/** 建表与索引。全部 IF NOT EXISTS，重复打开安全 */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS categories (
    name       TEXT NOT NULL,
    kind       TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (name, kind)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    date         TEXT    NOT NULL,
    kind         TEXT    NOT NULL CHECK (kind IN ('income', 'expense')),
    amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
    category     TEXT    NOT NULL,
    note         TEXT    NOT NULL DEFAULT ''
  );

  CREATE INDEX IF NOT EXISTS idx_tx_date     ON transactions (date);
  CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions (category);
`

const SEED_CATEGORIES: ReadonlyArray<readonly [string, 'income' | 'expense', number]> = [
  ['餐饮', 'expense', 10],
  ['交通', 'expense', 20],
  ['购物', 'expense', 30],
  ['居住', 'expense', 40],
  ['医疗', 'expense', 50],
  ['娱乐', 'expense', 60],
  ['工资', 'income', 10],
  ['奖金', 'income', 20],
  ['理财收益', 'income', 30],
]

async function open(): Promise<Opened> {
  if (opened) return opened

  const sqlite3 = await sqlite3InitModule()

  let pool: Pool
  try {
    pool = await sqlite3.installOpfsSAHPoolVfs({
      // clearOnInit 必须保持默认的 false：官方 sahpool 演示里设成了 true，
      // 那会让每次刷新页面都清空数据库。
      directory: '/ledger-vfs',
      initialCapacity: POOL_CAPACITY,
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(
      `无法初始化 OPFS 存储（${detail}）。` +
        '最常见的原因是同一浏览器里已有一个标签页打开了本账本 —— 该存储同一时间只允许一个连接。' +
        '请关闭其他标签页后刷新本页。',
    )
  }

  // sahpool 不支持 WAL，用默认的 DELETE 日志模式
  const db = new pool.OpfsSAHPoolDb(DB_FILE)
  db.exec('PRAGMA journal_mode=DELETE;')
  db.exec(SCHEMA)

  // 种子分类只在首次建库时写入，之后不会覆盖用户改动
  db.exec('BEGIN;')
  try {
    for (const [name, kind, sortOrder] of SEED_CATEGORIES) {
      db.exec({
        sql: 'INSERT OR IGNORE INTO categories (name, kind, sort_order) VALUES (?, ?, ?)',
        bind: [name, kind, sortOrder],
      })
    }
    db.exec('COMMIT;')
  } catch (err) {
    db.exec('ROLLBACK;')
    throw err
  }

  opened = { db, pool }
  return opened
}

function reply(message: Response, transfer?: Transferable[]): void {
  if (transfer && transfer.length > 0) {
    self.postMessage(message, { transfer })
  } else {
    self.postMessage(message)
  }
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const request = event.data
  try {
    const { db, pool } = await open()

    switch (request.op) {
      case 'ping':
        break

      case 'all':
        reply({ id: request.id, ok: true, rows: db.selectObjects(request.sql, request.bind) })
        break

      case 'get':
        reply({ id: request.id, ok: true, row: db.selectObject(request.sql, request.bind) })
        break

      case 'run':
        db.exec({ sql: request.sql, bind: request.bind })
        reply({ id: request.id, ok: true })
        break

      case 'export': {
        // 导出前把日志合并回主库，否则可能拿到未落盘的内容
        db.exec('PRAGMA wal_checkpoint(TRUNCATE);')
        // sahpool 的文件名映射由 VFS 维护，必须用池的接口导出，不能直接读 OPFS
        const bytes = await pool.exportFile(DB_FILE)
        // 用 transfer 转移所有权，避免复制整份数据库
        reply({ id: request.id, ok: true, row: bytes }, [bytes.buffer as ArrayBuffer])
        break
      }
    }
  } catch (err) {
    reply({ id: request.id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
