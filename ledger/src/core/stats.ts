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

export interface DailyStats {
  /** 今日净支出 */
  todayCents: number
  /** 本月累计净支出 */
  monthToDateCents: number
  /** 本月已过天数（含今天），用来算日均 */
  elapsedDays: number
  /** 本月天数 */
  daysInMonth: number
  /** 剩余天数（含今天）；已过完则为 0 */
  remainingDays: number
  /** 本月日均支出 = 累计 ÷ 已过天数 */
  dailyAverageCents: number
  /**
   * 剩余每天可用。仅在设了月度预期时有值：
   * (预期 − 累计) ÷ 剩余天数，允许为负（表示已经超了）
   */
  allowanceCents: number | null
}

/**
 * 每日统计。
 * @param month 形如 YYYY-MM
 * @param today 今天，形如 YYYY-MM-DD
 * @param budgetCents 本月预期花销；未设定时传 null
 */
export function dailyStats(
  rows: readonly LedgerRow[],
  month: string,
  today: string,
  budgetCents: number | null,
): DailyStats {
  const daysInMonth = daysIn(month)
  const dayOfMonth = Number(today.slice(8, 10))
  // 若传入的 today 不属于该月，按整月已过处理，避免出现负数天数
  const elapsedDays = today.startsWith(month) ? Math.min(Math.max(dayOfMonth, 1), daysInMonth) : daysInMonth
  const remainingDays = today.startsWith(month) ? daysInMonth - dayOfMonth + 1 : 0

  const monthRows = rowsOfMonth(rows, month)
  const monthToDateCents = netOf(monthRows)
  const todayCents = netOf(rowsOfDay(rows, today))

  return {
    todayCents,
    monthToDateCents,
    elapsedDays,
    daysInMonth,
    remainingDays,
    dailyAverageCents: Math.round(monthToDateCents / elapsedDays),
    allowanceCents:
      budgetCents === null || remainingDays <= 0
        ? null
        : Math.round((budgetCents - monthToDateCents) / remainingDays),
  }
}

/** 支出侧净额：正常支出减去退款 */
function netOf(rows: readonly LedgerRow[]): number {
  let net = 0
  for (const row of rows) {
    if (row.kind !== 'expense') continue
    net += row.isRefund === true ? -row.amountCents : row.amountCents
  }
  return net
}

export function daysIn(month: string): number {
  const [year = '1970', mon = '01'] = month.split('-')
  return new Date(Number(year), Number(mon), 0).getDate()
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
