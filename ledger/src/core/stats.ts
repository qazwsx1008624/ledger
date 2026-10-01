/**
 * 统计口径（纯函数，不依赖 DOM 与数据库）。
 *
 * 这里的每个口径都由 money.test.ts / stats.test.ts 守住。
 * 原因：这些逻辑一旦写错，界面上显示的数字看起来仍然完全正常，靠肉眼无法发现。
 *
 * 核心口径：
 *   净支出 = 正常支出 − 退款
 *   可存下 = 收入 − 净支出
 */
import type { LedgerRow } from './types'

/** 只保留未删除的账目。所有统计的入口都必须先过这一层 */
export function visible(rows: readonly LedgerRow[]): LedgerRow[] {
  return rows.filter((row) => row.deletedAt === undefined)
}

export function rowsOfMonth(rows: readonly LedgerRow[], month: string): LedgerRow[] {
  return visible(rows).filter((row) => row.date.startsWith(month))
}

export function rowsOfDay(rows: readonly LedgerRow[], day: string): LedgerRow[] {
  return visible(rows).filter((row) => row.date === day)
}

export interface MonthTotals {
  /** 收入合计 */
  incomeCents: number
  /** 正常支出合计（不含退款） */
  expenseCents: number
  /** 退款合计（正数） */
  refundCents: number
  /** 净支出 = expenseCents − refundCents */
  netExpenseCents: number
  /** 可存下 = incomeCents − netExpenseCents */
  savedCents: number
  /** 账目笔数，不包含退款 */
  count: number
}

export function monthTotals(rows: readonly LedgerRow[], month: string): MonthTotals {
  let incomeCents = 0
  let expenseCents = 0
  let refundCents = 0
  let count = 0

  for (const row of rowsOfMonth(rows, month)) {
    if (row.kind === 'income') {
      incomeCents += row.amountCents
      count += 1
    } else if (row.isRefund === true) {
      refundCents += row.amountCents
    } else {
      expenseCents += row.amountCents
      count += 1
    }
  }

  const netExpenseCents = expenseCents - refundCents
  return {
    incomeCents,
    expenseCents,
    refundCents,
    netExpenseCents,
    savedCents: incomeCents - netExpenseCents,
    count,
  }
}

export interface CategoryLine {
  categoryId: number
  /** 净支出：该分类的正常支出减去该分类的退款 */
  netCents: number
  /** 该分类的退款合计（正数） */
  refundCents: number
  count: number
  /** 占本月净支出的比例，0–1；本月净支出为 0 时为 0 */
  share: number
}

/**
 * 分类占比。只统计支出侧（退款抵扣所属分类）。
 * 收入分类不出现在这里。
 */
export function categoryBreakdown(rows: readonly LedgerRow[], month: string): CategoryLine[] {
  const bucket = new Map<number, { net: number; refund: number; count: number }>()

  for (const row of rowsOfMonth(rows, month)) {
    if (row.kind !== 'expense') continue

    const entry = bucket.get(row.categoryId) ?? { net: 0, refund: 0, count: 0 }
    if (row.isRefund === true) {
      entry.net -= row.amountCents
      entry.refund += row.amountCents
    } else {
      entry.net += row.amountCents
      entry.count += 1
    }
    bucket.set(row.categoryId, entry)
  }

  const total = [...bucket.values()].reduce((sum, entry) => sum + entry.net, 0)

  return [...bucket.entries()]
    .map(([categoryId, entry]) => ({
      categoryId,
      netCents: entry.net,
      refundCents: entry.refund,
      count: entry.count,
      share: total > 0 ? entry.net / total : 0,
    }))
    .sort((a, b) => b.netCents - a.netCents)
}

/** 当前月的支出侧净额合计，即所有分类净额之和 */
export function sumNet(lines: readonly CategoryLine[]): number {
  return lines.reduce((sum, line) => sum + line.netCents, 0)
}

/** 某一天的净支出（正常支出 − 退款，已排除软删除）。收入不计入 */
export function dayNet(rows: readonly LedgerRow[], day: string): number {
  let net = 0
  for (const row of rowsOfDay(rows, day)) {
    if (row.kind !== 'expense') continue
    net += row.isRefund === true ? -row.amountCents : row.amountCents
  }
  return net
}

/** 用途待补充的账目，按金额从大到小（大额更容易想起用途） */
export function pendingRows(rows: readonly LedgerRow[]): LedgerRow[] {
  return visible(rows)
    .filter((row) => row.pendingCategory === true)
    .sort((a, b) => b.amountCents - a.amountCents || b.id - a.id)
}

/** 已删除的账目，最近删除的在前 */
export function deletedRows(rows: readonly LedgerRow[]): LedgerRow[] {
  return rows.filter((row) => row.deletedAt !== undefined).sort((a, b) => b.id - a.id)
}

/** 指定月份的收入侧明细合计 */
export function incomeTotals(rows: readonly LedgerRow[], month: string): CategoryLine[] {
  const bucket = new Map<number, { total: number; count: number }>()
  for (const row of rowsOfMonth(rows, month)) {
    if (row.kind !== 'income') continue
    const entry = bucket.get(row.categoryId) ?? { total: 0, count: 0 }
    entry.total += row.amountCents
    entry.count += 1
    bucket.set(row.categoryId, entry)
  }
  const total = [...bucket.values()].reduce((sum, entry) => sum + entry.total, 0)
  return [...bucket.entries()]
    .map(([categoryId, entry]) => ({
      categoryId,
      netCents: entry.total,
      refundCents: 0,
      count: entry.count,
      share: total > 0 ? entry.total / total : 0,
    }))
    .sort((a, b) => b.netCents - a.netCents)
}
