/**
 * 演示用的内存数据源。
 *
 * 这一版刻意不接 SQLite：demo 的目的是评估交互与统计口径，
 * 而持久化那一层不改变使用体验。代价是刷新页面数据重置。
 * 接真实数据库时应替换本文件，保持对外接口（动作函数）不变。
 */
import { useSyncExternalStore } from 'react'
import type { Category, LedgerRow, TxKind } from './types'
import { addCategory, moveCategory, removeCategory, renameCategory } from './categories'

export interface LedgerState {
  /** demo 用的「今天」。真实实现里应取系统日期 */
  referenceDate: string
  categories: Category[]
  rows: LedgerRow[]
  /** 本月预期花销（分）；null 表示未设定 */
  budgetCents: number | null
}

/** 预置分类，按大学生活费场景 */
const SEED_CATEGORIES: readonly Omit<Category, 'id'>[] = [
  { kind: 'expense', name: '饮食', sortOrder: 10 },
  { kind: 'expense', name: '日用', sortOrder: 20 },
  { kind: 'expense', name: '水电通讯', sortOrder: 30 },
  { kind: 'expense', name: '交通', sortOrder: 40 },
  { kind: 'expense', name: '购物', sortOrder: 50 },
  { kind: 'expense', name: '娱乐', sortOrder: 60 },
  { kind: 'expense', name: '学习', sortOrder: 70 },
  { kind: 'expense', name: '医疗', sortOrder: 80 },
  { kind: 'income', name: '家人生活费', sortOrder: 10 },
  { kind: 'income', name: '兼职', sortOrder: 20 },
  { kind: 'income', name: '奖学金', sortOrder: 30 },
]

function buildCategories(): Category[] {
  return SEED_CATEGORIES.map((category, index) => ({ ...category, id: index + 1 }))
}

const CATEGORY_ID: Record<string, number> = {
  饮食: 1,
  日用: 2,
  水电通讯: 3,
  交通: 4,
  购物: 5,
  娱乐: 6,
  学习: 7,
  医疗: 8,
  家人生活费: 9,
  兼职: 10,
  奖学金: 11,
}

/** 简写：[日期, 分类, 元, 备注, 标记] */
type SeedTuple = readonly [string, keyof typeof CATEGORY_ID, number, string, 'refund' | 'pending' | '']

const SEED_ROWS: readonly SeedTuple[] = [
  // ---- 9 月 ----
  ['2026-09-01', '家人生活费', 2000, '9 月生活费', ''],
  ['2026-09-01', '购物', 380, '新生床品', ''],
  ['2026-09-02', '饮食', 22, '食堂午饭', ''],
  ['2026-09-02', '日用', 68, '洗发水 纸巾', ''],
  ['2026-09-03', '饮食', 30, '食堂', ''],
  ['2026-09-04', '水电通讯', 100, '话费充值', ''],
  ['2026-09-05', '学习', 120, '教材', ''],
  ['2026-09-06', '饮食', 55, '和同学吃饭', ''],
  ['2026-09-07', '交通', 26, '公交地铁', ''],
  ['2026-09-08', '饮食', 42, '食堂', ''],
  ['2026-09-09', '日用', 95, '拖鞋 水杯', ''],
  ['2026-09-10', '饮食', 118, '宿舍聚餐', ''],
  ['2026-09-11', '娱乐', 60, '电影票', ''],
  ['2026-09-12', '饮食', 38, '午饭', ''],
  ['2026-09-13', '交通', 120, '打车回家', ''],
  ['2026-09-14', '饮食', 26, '食堂', ''],
  ['2026-09-15', '学习', 200, '打印文献', ''],
  ['2026-09-16', '饮食', 138, '外卖', ''],
  ['2026-09-17', '水电通讯', 80, '宿舍水电', ''],
  ['2026-09-18', '饮食', 33, '食堂', ''],
  ['2026-09-19', '购物', 260, '外套', ''],
  ['2026-09-20', '饮食', 46, '食堂', ''],
  ['2026-09-21', '娱乐', 88, 'KTV', ''],
  ['2026-09-22', '饮食', 15, '早餐', ''],
  ['2026-09-23', '日用', 42, '洗衣液', ''],
  ['2026-09-24', '饮食', 72, '火锅', ''],
  ['2026-09-25', '医疗', 85, '感冒药', ''],
  ['2026-09-26', '饮食', 39, '食堂', ''],
  ['2026-09-27', '交通', 40, '打车去车站', ''],
  ['2026-09-28', '购物', 180, '鞋子', 'refund'],
  ['2026-09-29', '饮食', 28, '食堂', ''],
  ['2026-09-30', '学习', 130, '参考书', ''],

  // ---- 10 月（截止到 demo 的今天 10-14）----
  ['2026-10-01', '家人生活费', 2000, '10 月生活费', ''],
  ['2026-10-01', '饮食', 62, '国庆和室友吃饭', ''],
  ['2026-10-02', '饮食', 48, '食堂', ''],
  ['2026-10-02', '交通', 35, '打车', ''],
  ['2026-10-03', '购物', 220, '秋天的卫衣', ''],
  ['2026-10-03', '日用', 54, '牙刷牙膏 抽纸', ''],
  ['2026-10-04', '饮食', 76, '火锅', ''],
  ['2026-10-05', '娱乐', 120, '电影和奶茶', ''],
  ['2026-10-06', '水电通讯', 100, '话费', ''],
  ['2026-10-07', '饮食', 41, '食堂', ''],
  ['2026-10-08', '学习', 86, '打印课件', ''],
  ['2026-10-08', '交通', 18, '地铁', ''],
  ['2026-10-09', '饮食', 35, '食堂', ''],
  ['2026-10-10', '购物', 150, '运动鞋', 'refund'],
  ['2026-10-11', '饮食', 240, '三顿外卖', 'pending'],
  ['2026-10-11', '日用', 36, '洗衣液', ''],
  ['2026-10-12', '饮食', 52, '食堂', ''],
  ['2026-10-12', '娱乐', 45, '游戏充值', ''],
  ['2026-10-13', '兼职', 300, '家教', ''],
  ['2026-10-13', '饮食', 29, '早餐 午饭', ''],
  ['2026-10-14', '饮食', 58, '食堂', ''],
  ['2026-10-14', '日用', 84, '超市采购', 'pending'],
]

function buildRows(): LedgerRow[] {
  return SEED_ROWS.map(([date, category, yuan, note, flag], index) => {
    const categoryId = CATEGORY_ID[category]
    if (categoryId === undefined) throw new Error(`演示数据里的分类不存在：${category}`)
    const kind: TxKind = categoryId >= 9 ? 'income' : 'expense'

    return {
      id: index + 1,
      date,
      kind,
      // 元 -> 分。演示数据都是整数元，这里仍按最保守的方式换算
      amountCents: Math.round(yuan * 100),
      categoryId,
      note,
      ...(flag === 'refund' ? { isRefund: true } : {}),
      ...(flag === 'pending' ? { pendingCategory: true } : {}),
    }
  })
}

let state: LedgerState = {
  referenceDate: '2026-10-14',
  categories: buildCategories(),
  rows: buildRows(),
  budgetCents: 200000,
}

const listeners = new Set<() => void>()

function setState(next: LedgerState): void {
  state = next
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

let nextId = SEED_ROWS.length + 1

export function addRow(draft: Omit<LedgerRow, 'id'>): void {
  setState({ ...state, rows: [...state.rows, { ...draft, id: nextId++ }] })
}

export function updateRow(id: number, patch: Partial<LedgerRow>): void {
  setState({
    ...state,
    rows: state.rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
  })
}

/** 软删除：写入时间戳，不物理删除，因此可以恢复 */
export function removeRow(id: number): void {
  updateRow(id, { deletedAt: state.referenceDate })
}

export function restoreRow(id: number): void {
  setState({
    ...state,
    rows: state.rows.map((row) => {
      if (row.id !== id) return row
      const { deletedAt: _dropped, ...rest } = row
      return rest
    }),
  })
}

export function setBudget(cents: number | null): void {
  setState({ ...state, budgetCents: cents })
}

/**
 * 分类操作。返回 null 表示成功，否则返回给用户看的错误信息。
 * 逻辑本身在 categories.ts 的纯函数里，这里有测试守住。
 */
export function addCategoryAction(kind: TxKind, name: string): string | null {
  const result = addCategory(state.categories, state.rows, kind, name)
  if (!result.ok) return result.error
  setState({ ...state, categories: result.categories, rows: result.rows })
  return null
}

export function renameCategoryAction(id: number, name: string): string | null {
  const result = renameCategory(state.categories, state.rows, id, name)
  if (!result.ok) return result.error
  setState({ ...state, categories: result.categories, rows: result.rows })
  return null
}

export function removeCategoryAction(id: number): string | null {
  const result = removeCategory(state.categories, state.rows, id)
  if (!result.ok) return result.error
  setState({ ...state, categories: result.categories, rows: result.rows })
  return null
}

export function moveCategoryAction(id: number, delta: number): void {
  setState({ ...state, categories: moveCategory(state.categories, id, delta) })
}

/** 某分类下未删除的账目数（删除分类时用来提示会迁移多少笔） */
export function categoryUsage(rows: readonly LedgerRow[], id: number): number {
  return rows.filter((row) => row.categoryId === id && row.deletedAt === undefined).length
}

export function categoryById(categories: readonly Category[], id: number): Category | undefined {
  return categories.find((category) => category.id === id)
}

/** 某类型下的分类，按 sortOrder 排列。顺序同时决定快捷键 1-9 的分配 */
export function categoriesOfKind(categories: readonly Category[], kind: TxKind): Category[] {
  return categories.filter((category) => category.kind === kind).sort((a, b) => a.sortOrder - b.sortOrder)
}

/** 整份状态重置，用于 demo 里「恢复演示数据」 */
export function resetDemo(): void {
  nextId = SEED_ROWS.length + 1
  setState({
    referenceDate: '2026-10-14',
    categories: buildCategories(),
    rows: buildRows(),
    budgetCents: 200000,
  })
}
