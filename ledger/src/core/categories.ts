/**
 * 分类管理（纯函数，可测）。
 *
 * 规则：
 * - 分类名在「同一收支类型内」唯一（历史缺陷：同名分类会让筛选与统计歧义）。
 * - 重命名只改名字：账目通过 categoryId 关联，历史账目自动跟着新名字走。
 * - 删除分类时，其下尚未删除的账目一并软删除（进回收站，可恢复）；
 *   已软删除的账目保持不变。不做「迁移到其他」——用户要的是删除即删除。
 */
import type { Category, LedgerRow, TxKind } from './types'

export type CategoryOp =
  | { ok: true; categories: Category[]; rows: LedgerRow[]; removedCount: number }
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
  return { ok: true, categories: [...categories, category], rows: [...rows], removedCount: 0 }
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
    removedCount: 0,
  }
}

/**
 * 删除分类。其下尚未删除的账目一并软删除（用 now 作为删除时间戳）。
 * @param now 软删除时间戳，例如当前日期字符串
 */
export function removeCategory(
  categories: readonly Category[],
  rows: readonly LedgerRow[],
  id: number,
  now: string,
): CategoryOp {
  const target = categories.find((category) => category.id === id)
  if (!target) return { ok: false, error: '分类不存在' }

  let removedCount = 0
  const nextRows = rows.map((row) => {
    if (row.categoryId !== id || row.deletedAt !== undefined) return row
    removedCount += 1
    return { ...row, deletedAt: now }
  })

  return {
    ok: true,
    categories: categories.filter((category) => category.id !== id),
    rows: nextRows,
    removedCount,
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
