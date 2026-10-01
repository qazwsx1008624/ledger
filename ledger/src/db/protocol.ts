/** 主线程与 Worker 之间的消息协议。 */

/** 允许绑定到 SQL 的参数类型 */
export type BindValue = string | number | null

export type Request =
  | { id: number; op: 'ping' }
  | { id: number; op: 'all'; sql: string; bind: BindValue[] }
  | { id: number; op: 'get'; sql: string; bind: BindValue[] }
  | { id: number; op: 'run'; sql: string; bind: BindValue[] }
  | { id: number; op: 'export' }
  | { id: number; op: 'import'; bytes: Uint8Array }

export type Response =
  | { id: number; ok: true; rows?: unknown[]; row?: unknown; error?: undefined }
  | { id: number; ok: false; error: string; rows?: undefined; row?: undefined }
