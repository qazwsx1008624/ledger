/** 主线程与 Worker 之间的消息协议。 */

/** 允许绑定到 SQL 的参数类型 */
export type BindValue = string | number | null

export type Request =
  | { id: number; op: 'ping' }
  | { id: number; op: 'bootstrap' }
  | { id: number; op: 'all'; sql: string; bind: BindValue[] }
  | { id: number; op: 'get'; sql: string; bind: BindValue[] }
  | { id: number; op: 'run'; sql: string; bind: BindValue[] }
  /** 执行 INSERT 并返回 last_insert_rowid */
  | { id: number; op: 'insert'; sql: string; bind: BindValue[] }
  | { id: number; op: 'record_backup' }
  | { id: number; op: 'export' }
  | { id: number; op: 'import'; bytes: Uint8Array }
  /** 读取导入文件的内容（不落地到主库），供合并同步用 */
  | { id: number; op: 'inspect_import'; bytes: Uint8Array }
  /** 合并结果全量写回：清空 transactions 后批量插入；新分类一并插入 */
  | { id: number; op: 'replace_transactions'; rows: RawRow[]; newCategories: RawCategory[] }

export type Response =
  | { id: number; ok: true; rows?: unknown[]; row?: unknown; error?: undefined }
  | { id: number; ok: false; error: string; rows?: undefined; row?: undefined }

/** bootstrap 返回的原始行（SQLite 里 0/1 表示布尔） */
export interface RawRow {
  id: number
  uuid: string
  date: string
  kind: string
  amountCents: number
  categoryId: number
  note: string
  isRefund: number
  pendingCategory: number
  deletedAt: string | null
  updatedAt: string
}

export interface RawCategory {
  id: number
  kind: string
  name: string
  sortOrder: number
}

export interface BootstrapData {
  categories: RawCategory[]
  rows: RawRow[]
  budget: string | null
  backupMaxCount: number
}
