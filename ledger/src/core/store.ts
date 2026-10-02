/**
 * 数据源：内存缓存 + SQLite 持久化（经由 src/db 的 Worker 客户端）。
 *
 * 架构取舍：
 * - UI 层照旧从 useSyncExternalStore 同步读取缓存，统计走 core 里的纯函数。
 * - 每次操作先写 SQLite（await），成功后更新缓存。数据量小（一年一两千条），
 *   全量缓存没有任何性能问题，换来 UI 层零异步改动。
 * - id 一律以 SQLite 自增为准；分类纯函数里临时分配的 id 在写库后会被真实 id 替换。
 */
import { useSyncExternalStore } from 'react'
import type { Category, LedgerRow, TxKind } from './types'
import { addCategory, moveCategory, removeCategory, renameCategory } from './categories'
import { mergeLedger } from './merge'
import { shiftDay, todayISO } from './money'
import * as db from '../db/ledger-client'
import type { BootstrapData, RawRow } from '../db/protocol'

export interface LedgerState {
  status: 'loading' | 'ready' | 'error'
  errorMessage: string | null
  /** 应用认为的「今天」。真实版本取系统日期 */
  referenceDate: string
  categories: Category[]
  rows: LedgerRow[]
  /** 月度预期花销（分）；null 表示未设定 */
  budgetCents: number | null
  /** 启动一致性检查：本地为空但备份清单显示历史上有过数据 */
  dataLossWarning: boolean
  lastBackup: { at: string; count: number } | null
}

const initial: LedgerState = {
  status: 'loading',
  errorMessage: null,
  referenceDate: todayISO(),
  categories: [],
  rows: [],
  budgetCents: null,
  dataLossWarning: false,
  lastBackup: null,
}

let state: LedgerState = initial

const listeners = new Set<() => void>()

function setState(patch: Partial<LedgerState>): void {
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useLedger(): LedgerState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  )
}

/* ------------------------------------------------------------------ */
/* 启动与数据加载                                                       */
/* ------------------------------------------------------------------ */

function mapRows(raw: readonly RawRow[]): LedgerRow[] {
  return raw.map((row) => ({
    id: row.id,
    uuid: row.uuid,
    date: row.date,
    kind: row.kind as TxKind,
    amountCents: row.amountCents,
    categoryId: row.categoryId,
    note: row.note,
    ...(row.isRefund === 1 ? { isRefund: true } : {}),
    ...(row.pendingCategory === 1 ? { pendingCategory: true } : {}),
    ...(row.deletedAt !== null ? { deletedAt: row.deletedAt } : {}),
    updatedAt: row.updatedAt,
  }))
}

function toRawRow(row: LedgerRow): RawRow {
  return {
    id: row.id,
    uuid: row.uuid,
    date: row.date,
    kind: row.kind,
    amountCents: row.amountCents,
    categoryId: row.categoryId,
    note: row.note,
    isRefund: row.isRefund === true ? 1 : 0,
    pendingCategory: row.pendingCategory === true ? 1 : 0,
    deletedAt: row.deletedAt ?? null,
    updatedAt: row.updatedAt,
  }
}

function applyBootstrap(data: BootstrapData): void {
  const rows = mapRows(data.rows)
  const budget = data.budget === null ? null : Number(data.budget)
  setState({
    status: 'ready',
    errorMessage: null,
    categories: data.categories.map((category) => ({
      id: category.id,
      kind: category.kind as TxKind,
      name: category.name,
      sortOrder: category.sortOrder,
    })),
    rows,
    budgetCents: budget !== null && Number.isFinite(budget) && budget > 0 ? budget : null,
    // 一致性检查：本地为空但备份清单显示历史上有数据 → 很可能是浏览器清了存储
    dataLossWarning: rows.length === 0 && data.backupMaxCount > 0,
  })
}

let bootstrapping: Promise<void> | null = null

/** 打开数据库、建表、加载数据。幂等；error 状态可重试 */
export async function initLedger(): Promise<void> {
  if (state.status === 'ready') return
  if (bootstrapping) return bootstrapping

  bootstrapping = (async () => {
    try {
      await db.initLedger()
      applyBootstrap(await db.bootstrap())
    } catch (err) {
      setState({ status: 'error', errorMessage: err instanceof Error ? err.message : String(err) })
    } finally {
      bootstrapping = null
    }
  })()
  return bootstrapping
}

/** 强制重新加载（导入备份、载入演示数据后调用） */
export async function reloadLedger(): Promise<void> {
  applyBootstrap(await db.bootstrap())
}

/* ------------------------------------------------------------------ */
/* 账目操作                                                            */
/* ------------------------------------------------------------------ */

/** 新增账目时不需要提供的字段（id / uuid / updatedAt 由数据层生成） */
export type RowInput = Omit<LedgerRow, 'id' | 'uuid' | 'updatedAt'>

export async function addRow(draft: RowInput): Promise<void> {
  const uuid = crypto.randomUUID()
  const updatedAt = new Date().toISOString()
  const id = await db.insert(
    `INSERT INTO transactions (uuid, date, kind, amount_cents, category_id, note, is_refund, pending_category, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid,
      draft.date,
      draft.kind,
      draft.amountCents,
      draft.categoryId,
      draft.note,
      draft.isRefund === true ? 1 : 0,
      draft.pendingCategory === true ? 1 : 0,
      updatedAt,
    ],
  )
  setState({ rows: [...state.rows, { ...draft, id, uuid, updatedAt }] })
}

export async function updateRow(id: number, full: RowInput): Promise<void> {
  const updatedAt = new Date().toISOString()
  await db.run(
    `UPDATE transactions
     SET date = ?, kind = ?, amount_cents = ?, category_id = ?, note = ?, is_refund = ?, pending_category = ?, updated_at = ?
     WHERE id = ?`,
    [
      full.date,
      full.kind,
      full.amountCents,
      full.categoryId,
      full.note,
      full.isRefund === true ? 1 : 0,
      full.pendingCategory === true ? 1 : 0,
      updatedAt,
      id,
    ],
  )
  setState({
    rows: state.rows.map((row) => (row.id === id ? { ...full, id, uuid: row.uuid, updatedAt } : row)),
  })
}

/** 软删除：写时间戳，可恢复。删除也是一种修改，同步更新 updated_at */
export async function removeRow(id: number): Promise<void> {
  const at = state.referenceDate
  const updatedAt = new Date().toISOString()
  await db.run('UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE id = ?', [at, updatedAt, id])
  setState({
    rows: state.rows.map((row) => (row.id === id ? { ...row, deletedAt: at, updatedAt } : row)),
  })
}

export async function restoreRow(id: number): Promise<void> {
  const updatedAt = new Date().toISOString()
  await db.run('UPDATE transactions SET deleted_at = NULL, updated_at = ? WHERE id = ?', [updatedAt, id])
  setState({
    rows: state.rows.map((row) => {
      if (row.id !== id) return row
      const { deletedAt: _dropped, ...rest } = row
      return { ...rest, updatedAt }
    }),
  })
}

/* ------------------------------------------------------------------ */
/* 预算                                                                */
/* ------------------------------------------------------------------ */

export async function setBudget(cents: number | null): Promise<void> {
  if (cents === null) {
    await db.run("DELETE FROM meta WHERE key = 'budget_cents'")
  } else {
    await db.run(
      `INSERT INTO meta (key, value) VALUES ('budget_cents', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [String(cents)],
    )
  }
  setState({ budgetCents: cents })
}

/* ------------------------------------------------------------------ */
/* 分类操作（写库后替换纯函数临时分配的 id）                             */
/* ------------------------------------------------------------------ */

export async function addCategoryAction(kind: TxKind, name: string): Promise<string | null> {
  const result = addCategory(state.categories, state.rows, kind, name)
  if (!result.ok) return result.error

  const created = result.categories.find(
    (category) => !state.categories.some((existing) => existing.id === category.id),
  )
  if (!created) return '创建分类失败'

  const realId = await db.insert(
    'INSERT INTO categories (kind, name, sort_order) VALUES (?, ?, ?)',
    [created.kind, created.name, created.sortOrder],
  )
  setState({
    categories: result.categories.map((category) =>
      category.id === created.id ? { ...category, id: realId } : category,
    ),
  })
  return null
}

export async function renameCategoryAction(id: number, name: string): Promise<string | null> {
  const result = renameCategory(state.categories, state.rows, id, name)
  if (!result.ok) return result.error
  await db.run('UPDATE categories SET name = ? WHERE id = ?', [result.categories.find((c) => c.id === id)?.name ?? name, id])
  setState({ categories: result.categories })
  return null
}

export async function removeCategoryAction(id: number): Promise<string | null> {
  const result = removeCategory(state.categories, state.rows, id, state.referenceDate)
  if (!result.ok) return result.error

  // 分类删除 + 其下未删除账目软删除（与纯函数行为一致）
  await db.run('DELETE FROM categories WHERE id = ?', [id])
  await db.run('UPDATE transactions SET deleted_at = ? WHERE category_id = ? AND deleted_at IS NULL', [
    state.referenceDate,
    id,
  ])
  setState({ categories: result.categories, rows: result.rows })
  return null
}

export async function moveCategoryAction(id: number, delta: number): Promise<void> {
  const next = moveCategory(state.categories, id, delta)
  const changed = next.filter((category) => {
    const before = state.categories.find((existing) => existing.id === category.id)
    return before !== undefined && before.sortOrder !== category.sortOrder
  })
  for (const category of changed) {
    await db.run('UPDATE categories SET sort_order = ? WHERE id = ?', [category.sortOrder, category.id])
  }
  setState({ categories: next })
}

/* ------------------------------------------------------------------ */
/* 备份与导入                                                          */
/* ------------------------------------------------------------------ */

/** 导出 .sqlite 字节，并在备份清单里记录一笔（供启动一致性检查） */
export async function exportBackup(): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = await db.exportBytes()
  const backup = await db.recordBackup()
  setState({ lastBackup: backup, dataLossWarning: false })
  return bytes
}

/** 用外部 .sqlite 文件覆盖当前数据库并重建缓存 */
export async function importBackup(bytes: Uint8Array): Promise<void> {
  await db.importBytes(bytes)
  await reloadLedger()
}

/**
 * 合并式导入（日常手动同步用）：读入文件内容，与本地账本按 uuid 合并后写回。
 * 规则见 src/core/merge.ts——两边的新账目都在，同一条按 updatedAt 取新，绝不覆盖丢数据。
 */
export async function mergeImportBytes(
  bytes: Uint8Array,
): Promise<{ added: number; updated: number; remapped: number }> {
  const incoming = await db.inspectImport(bytes)
  const incomingCategories: Category[] = incoming.categories.map((category) => ({
    id: category.id,
    kind: category.kind as TxKind,
    name: category.name,
    sortOrder: category.sortOrder,
  }))
  const incomingRows = mapRows(incoming.rows)

  const result = mergeLedger(state.categories, state.rows, incomingCategories, incomingRows)

  const existingIds = new Set(state.categories.map((category) => category.id))
  const newCategories = result.categories
    .filter((category) => !existingIds.has(category.id))
    .map((category) => ({
      id: category.id,
      kind: category.kind,
      name: category.name,
      sortOrder: category.sortOrder,
    }))

  await db.replaceTransactions(result.rows.map(toRawRow), newCategories)
  await db.recordBackup()
  await reloadLedger()
  return { added: result.added, updated: result.updated, remapped: result.remapped }
}

/* ------------------------------------------------------------------ */
/* 演示数据（体验用）                                                   */
/* ------------------------------------------------------------------ */

/** 载入演示数据：清空现有账目，生成相对今天的约两周模拟记录 */
export async function loadDemoData(): Promise<void> {
  await db.run('DELETE FROM transactions')
  await db.run('DELETE FROM backups')

  const categories = state.categories
  const expenseIds = categories.filter((c) => c.kind === 'expense').map((c) => c.id)
  const incomeIds = categories.filter((c) => c.kind === 'income').map((c) => c.id)
  if (expenseIds.length === 0 || incomeIds.length === 0) return

  // 相对今天生成：收入在前，支出逐日铺开
  const today = state.referenceDate
  const plan: Array<[number, 'expense' | 'income', number, string, 'refund' | 'pending' | '']> = [
    [0, 'income', 200000, '本月生活费', ''],
    [0, 'expense', 3200, '午饭', ''],
    [0, 'expense', 5800, '食堂', ''],
    [-1, 'expense', 1500, '早餐', ''],
    [-1, 'expense', 8400, '超市采购', 'pending'],
    [-2, 'expense', 3600, '洗衣液', ''],
    [-2, 'expense', 1200, '地铁', ''],
    [-3, 'expense', 4600, '外卖', ''],
    [-3, 'expense', 8800, '和同学吃饭', ''],
    [-4, 'expense', 24000, '三顿外卖', 'pending'],
    [-4, 'expense', 4500, '游戏充值', ''],
    [-5, 'expense', 15000, '运动鞋', 'refund'],
    [-5, 'expense', 900, '公交', ''],
    [-6, 'expense', 5200, '食堂', ''],
    [-6, 'expense', 12000, '电影票', ''],
    [-7, 'expense', 2200, '奶茶', ''],
    [-8, 'expense', 10000, '话费充值', ''],
    [-8, 'expense', 2800, '打印课件', ''],
    [-9, 'expense', 6800, '火锅', ''],
    [-9, 'expense', 3100, '日用品', ''],
    [-10, 'expense', 4200, '食堂', ''],
    [-11, 'expense', 7500, '超市', ''],
    [-11, 'expense', 1800, '打车', ''],
    [-12, 'expense', 5600, '外卖', ''],
    [-12, 'expense', 9000, '网购', ''],
    [-13, 'expense', 3300, '食堂', ''],
    [-13, 'expense', 4600, '饮料零食', ''],
    [-14, 'expense', 5100, '午饭', ''],
  ]

  for (const [offset, kind, cents, note, flag] of plan) {
    const idPool = kind === 'income' ? incomeIds : expenseIds
    const categoryId = idPool[offset % idPool.length] ?? idPool[0] ?? 0
    const uuid = crypto.randomUUID()
    const updatedAt = new Date().toISOString()
    await db.insert(
      `INSERT INTO transactions (uuid, date, kind, amount_cents, category_id, note, is_refund, pending_category, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid,
        shiftDay(today, offset),
        kind,
        cents,
        categoryId,
        note,
        flag === 'refund' ? 1 : 0,
        flag === 'pending' ? 1 : 0,
        updatedAt,
      ],
    )
  }

  await db.run(
    `INSERT INTO meta (key, value) VALUES ('budget_cents', '200000')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  )
  await reloadLedger()
}

/* ------------------------------------------------------------------ */
/* 工具（UI 便捷函数，保持与 demo 版本一致的调用方式）                   */
/* ------------------------------------------------------------------ */

export function categoryById(categories: readonly Category[], id: number): Category | undefined {
  return categories.find((category) => category.id === id)
}

/** 某类型下的分类，按 sortOrder 排列。顺序同时决定快捷键 1-9 的分配 */
export function categoriesOfKind(categories: readonly Category[], kind: TxKind): Category[] {
  return categories.filter((category) => category.kind === kind).sort((a, b) => a.sortOrder - b.sortOrder)
}

/** 某分类下未删除的账目数 */
export function categoryUsage(rows: readonly LedgerRow[], id: number): number {
  return rows.filter((row) => row.categoryId === id && row.deletedAt === undefined).length
}
