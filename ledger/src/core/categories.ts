/**
 * 分类管理（纯函数，可测）。
 *
 * 规则：
 * - 分类名在「同一收支类型内」唯一（历史缺陷：同名分类会让筛选与统计歧义）。
 * - 重命名只改名字：账目通过 categoryId 关联，历史账目自动跟着新名字走。
 * - 删除有账目引用的分类时，账目迁移到「其他」分类（自动创建），绝不丢数据。
 * - 排序在同类型内进行，交换 sortOrder。
 */
import type { Category, LedgerRow, TxKind } from './types'

export const FALLBACK_CATEGORY = '其他'

export type CategoryOp =
  | { ok: true; categories: Category[]; rows: LedgerRow[] }
  | { ok: false; error: string }

function nameTaken(
  categories: readonly Category[],
  kind: TxKind,
  name: string,
  excludeId?: number,
): boolean {
  return categories.some(
    (category) => category.kind === kind && category.name === name && category.id !== excludeId,
  )
}

function maxOrder(categories: readonly Category[], kind: TxKind): number {
  return categories.filter((category) => category.kind === kind).reduce((max, c) => Math.max(max, c.sortOrder), 0)
}

export function addCategory(
  categories: readonly Category[],
  rows: readonly LedgerRow[],
  kind: TxKind,
  name: string,
): CategoryOp {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, error: '分类名不能为空' }
  if (nameTaken(categories, kind, trimmed)) return { ok: false, error: `已存在名为「${trimmed}」的分类` }

  const maxId = categories.reduce((max, category) => Math.max(max, category.id), 0)
  const category: Category = {
    id: maxId + 1,
    kind,
    name: trimmed,
    sortOrder: maxOrder(categories, kind) + 10,
  }
  return { ok: true, categories: [...categories, category], rows: [...rows] }
}

export function renameCategory(
  categories: readonly Category[],
  rows: readonly LedgerRow[],
  id: number,
  name: string,
): CategoryOp {
  const target = categories.find((category) => category.id === id)
  if (!target) return { ok: false, error: '分类不存在' }

  const trimmed = name.trim()
  if (!trimmed) return { ok: false, error: '分类名不能为空' }
  if (nameTaken(categories, target.kind, trimmed, id)) {
    return { ok: false, error: `已存在名为「${trimmed}」的分类` }
  }

  return {
    ok: true,
    categories: categories.map((category) => (category.id === id ? { ...category, name: trimmed } : category)),
    rows: [...rows],
  }
}

export function removeCategory(
  categories: readonly Category[],
  rows: readonly LedgerRow[],
  id: number,
): CategoryOp {
  const target = categories.find((category) => category.id === id)
  if (!target) return { ok: false, error: '分类不存在' }

  const referenced = rows.filter((row) => row.categoryId === id && row.deletedAt === undefined)
  if (referenced.length === 0) {
    return { ok: true, categories: categories.filter((category) => category.id !== id), rows: [...rows] }
  }

  // 有账目引用：迁移到「其他」，绝不丢账
  const existing = categories.find(
    (category) => category.kind === target.kind && category.name === FALLBACK_CATEGORY,
  )

  let nextCategories: Category[]
  let fallbackId: number
  if (existing) {
    fallbackId = existing.id
    nextCategories = categories.filter((category) => category.id !== id)
  } else {
    const maxId = categories.reduce((max, category) => Math.max(max, category.id), 0)
    fallbackId = maxId + 1
    nextCategories = [
      ...categories.filter((category) => category.id !== id),
      { id: fallbackId, kind: target.kind, name: FALLBACK_CATEGORY, sortOrder: maxOrder(categories, target.kind) + 10 },
    ]
  }

  return {
    ok: true,
    categories: nextCategories,
    rows: rows.map((row) => (row.categoryId === id ? { ...row, categoryId: fallbackId } : row)),
  }
}

export function moveCategory(categories: readonly Category[], id: number, delta: number): Category[] {
  const target = categories.find((category) => category.id === id)
  if (!target) return [...categories]

  const peers = categories
    .filter((category) => category.kind === target.kind)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const index = peers.findIndex((category) => category.id === id)
  const swapped = peers[index + delta]
  if (!swapped) return [...categories]

  const targetOrder = target.sortOrder
  const swappedOrder = swapped.sortOrder
  return categories.map((category) =>
    category.id === id
      ? { ...category, sortOrder: swappedOrder }
      : category.id === swapped.id
        ? { ...category, sortOrder: targetOrder }
        : category,
  )
}
