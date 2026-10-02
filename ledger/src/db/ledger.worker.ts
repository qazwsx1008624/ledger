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
import type { BootstrapData, Request, Response } from './protocol'

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
  sqlite3: Sqlite3
}

let opened: Opened | null = null

/**
 * 建表与索引。全部 IF NOT EXISTS，重复打开安全。
 *
 * 模型与 src/core/types.ts 一致：
 * - 金额存正数「分」，方向由 kind 决定；退款靠 is_refund 标记，不靠负号
 * - 软删除靠 deleted_at，任何统计都要先过滤它
 * - 分类与账目通过 category_id 关联，重命名分类不破坏历史
 */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    kind       TEXT    NOT NULL CHECK (kind IN ('income', 'expense')),
    name       TEXT    NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_cat_kind_name ON categories (kind, name);

  CREATE TABLE IF NOT EXISTS transactions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    date             TEXT    NOT NULL,
    kind             TEXT    NOT NULL CHECK (kind IN ('income', 'expense')),
    amount_cents     INTEGER NOT NULL CHECK (amount_cents >= 0),
    category_id      INTEGER NOT NULL,
    note             TEXT    NOT NULL DEFAULT '',
    is_refund        INTEGER NOT NULL DEFAULT 0,
    pending_category INTEGER NOT NULL DEFAULT 0,
    deleted_at       TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_tx_date     ON transactions (date);
  CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions (category_id);

  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- 备份清单：记录每次备份的时间与账目笔数，用于启动一致性检查
  CREATE TABLE IF NOT EXISTS backups (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    at    TEXT    NOT NULL,
    count INTEGER NOT NULL
  );
`

const SEED_CATEGORIES: ReadonlyArray<readonly [string, 'income' | 'expense', number]> = [
  ['饮食', 'expense', 10],
  ['日用', 'expense', 20],
  ['水电通讯', 'expense', 30],
  ['交通', 'expense', 40],
  ['购物', 'expense', 50],
  ['娱乐', 'expense', 60],
  ['学习', 'expense', 70],
  ['医疗', 'expense', 80],
  ['家人生活费', 'income', 10],
  ['兼职', 'income', 20],
  ['奖学金', 'income', 30],
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
        sql: 'INSERT OR IGNORE INTO categories (kind, name, sort_order) VALUES (?, ?, ?)',
        bind: [kind, name, sortOrder],
      })
    }
    db.exec('COMMIT;')
  } catch (err) {
    db.exec('ROLLBACK;')
    throw err
  }

  opened = { db, pool, sqlite3 }
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
    const { db, pool, sqlite3 } = await open()

    switch (request.op) {
      case 'ping':
        reply({ id: request.id, ok: true })
        break

      case 'bootstrap': {
        const categories = db.selectObjects(
          'SELECT id, kind, name, sort_order AS sortOrder FROM categories ORDER BY kind, sort_order, id',
        )
        const rows = db.selectObjects(
          `SELECT id, date, kind, amount_cents AS amountCents, category_id AS categoryId, note,
                  is_refund AS isRefund, pending_category AS pendingCategory, deleted_at AS deletedAt
           FROM transactions ORDER BY id`,
        )
        const budget = db.selectObject("SELECT value FROM meta WHERE key = 'budget_cents'")
        const backup = db.selectObject('SELECT MAX(count) AS maxCount FROM backups')
        const data: BootstrapData = {
          categories: categories as unknown as BootstrapData['categories'],
          rows: rows as unknown as BootstrapData['rows'],
          budget: typeof budget?.value === 'string' ? budget.value : null,
          backupMaxCount: typeof backup?.maxCount === 'number' ? backup.maxCount : 0,
        }
        reply({ id: request.id, ok: true, row: data })
        break
      }

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

      case 'insert': {
        db.exec({ sql: request.sql, bind: request.bind })
        const row = db.selectObject('SELECT last_insert_rowid() AS id')
        reply({ id: request.id, ok: true, row: { id: Number(row?.id ?? 0) } })
        break
      }

      case 'record_backup': {
        const countValue = db.selectValue(
          'SELECT COUNT(*) FROM transactions WHERE deleted_at IS NULL',
          undefined,
          sqlite3.capi.SQLITE_INTEGER,
        )
        const at = new Date().toISOString()
        const count = typeof countValue === 'number' ? countValue : 0
        db.exec({ sql: 'INSERT INTO backups (at, count) VALUES (?, ?)', bind: [at, count] })
        reply({ id: request.id, ok: true, row: { at, count } })
        break
      }

      case 'export': {
        // 导出前把日志合并回主库，否则可能拿到未落盘的内容
        db.exec('PRAGMA wal_checkpoint(TRUNCATE);')
        // sahpool 的文件名映射由 VFS 维护，必须用池的接口导出，不能直接读 OPFS
        const bytes = await pool.exportFile(DB_FILE)
        // 用 transfer 转移所有权，避免复制整份数据库
        reply({ id: request.id, ok: true, row: bytes }, [bytes.buffer as ArrayBuffer])
        break
      }

      case 'import': {
        // 导入备份：关闭当前连接、覆盖数据库文件、重新打开
        db.close()
        opened = null
        await pool.OpfsSAHPoolDb.importDb(DB_FILE, request.bytes)
        await open()
        reply({ id: request.id, ok: true })
        break
      }
    }
  } catch (err) {
    reply({ id: request.id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
