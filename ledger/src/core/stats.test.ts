import { describe, expect, it } from 'vitest'
import {
  categoryBreakdown,
  dayNet,
  deletedRows,
  monthTotals,
  pendingRows,
  rowsOfMonth,
  sumNet,
  visible,
} from './stats'
import type { LedgerRow } from './types'

/** 构造一条账目，只写关心的字段 */
function row(partial: Partial<LedgerRow> & Pick<LedgerRow, 'id' | 'date' | 'kind' | 'amountCents'>): LedgerRow {
  return { categoryId: 1, note: '', ...partial }
}

const CAT_FOOD = 1
const CAT_SHOP = 5

describe('净支出与可存下（核心口径）', () => {
  it('支出 300 后退款 300，净支出与分类净额都必须是 0', () => {
    const rows = [
      row({ id: 1, date: '2026-10-01', kind: 'expense', amountCents: 30000, categoryId: CAT_SHOP }),
      row({ id: 2, date: '2026-10-05', kind: 'expense', amountCents: 30000, categoryId: CAT_SHOP, isRefund: true }),
    ]

    const totals = monthTotals(rows, '2026-10')
    expect(totals.expenseCents).toBe(30000)
    expect(totals.refundCents).toBe(30000)
    expect(totals.netExpenseCents).toBe(0)
    // 退款不能出现在收入里
    expect(totals.incomeCents).toBe(0)

    const breakdown = categoryBreakdown(rows, '2026-10')
    expect(breakdown).toHaveLength(1)
    expect(breakdown[0]?.netCents).toBe(0)
    expect(breakdown[0]?.refundCents).toBe(30000)
  })

  it('分类占比表不得与净支出口径打架（不能重复计算退款）', () => {
    const rows = [
      row({ id: 1, date: '2026-10-01', kind: 'expense', amountCents: 10000, categoryId: CAT_FOOD }),
      row({ id: 2, date: '2026-10-02', kind: 'expense', amountCents: 5000, categoryId: CAT_SHOP }),
      row({ id: 3, date: '2026-10-03', kind: 'expense', amountCents: 2000, categoryId: CAT_SHOP, isRefund: true }),
    ]

    const totals = monthTotals(rows, '2026-10')
    const lines = categoryBreakdown(rows, '2026-10')

    // 两个视图算出来的净支出必须一致，这是最容易写错的地方
    expect(sumNet(lines)).toBe(totals.netExpenseCents)
    expect(totals.netExpenseCents).toBe(13000)

    // 退款抵扣它所属的分类
    const shopping = lines.find((line) => line.categoryId === CAT_SHOP)
    expect(shopping?.netCents).toBe(3000)
  })

  it('可存下 = 收入 − 净支出', () => {
    const rows = [
      row({ id: 1, date: '2026-10-01', kind: 'income', amountCents: 200000, categoryId: 9 }),
      row({ id: 2, date: '2026-10-02', kind: 'expense', amountCents: 50000, categoryId: CAT_FOOD }),
      row({ id: 3, date: '2026-10-03', kind: 'expense', amountCents: 10000, categoryId: CAT_SHOP, isRefund: true }),
    ]

    const totals = monthTotals(rows, '2026-10')
    expect(totals.incomeCents).toBe(200000)
    expect(totals.netExpenseCents).toBe(40000)
    expect(totals.savedCents).toBe(160000)
  })

  it('退款大于支出时净支出允许为负（退款确实超过了本月消费）', () => {
    const rows = [
      row({ id: 1, date: '2026-10-01', kind: 'expense', amountCents: 1000, categoryId: CAT_SHOP }),
      row({ id: 2, date: '2026-10-02', kind: 'expense', amountCents: 5000, categoryId: CAT_SHOP, isRefund: true }),
    ]
    expect(monthTotals(rows, '2026-10').netExpenseCents).toBe(-4000)
  })

  it('笔数不含退款', () => {
    const rows = [
      row({ id: 1, date: '2026-10-01', kind: 'expense', amountCents: 1000 }),
      row({ id: 2, date: '2026-10-02', kind: 'expense', amountCents: 1000, isRefund: true }),
      row({ id: 3, date: '2026-10-03', kind: 'income', amountCents: 1000, categoryId: 9 }),
    ]
    expect(monthTotals(rows, '2026-10').count).toBe(2)
  })
})

describe('软删除不得计入任何合计', () => {
  it('删除唯一的支出一笔后，净支出回到 0', () => {
    const rows = [
      row({ id: 1, date: '2026-10-01', kind: 'expense', amountCents: 10000, categoryId: CAT_FOOD, deletedAt: '2026-10-14' }),
    ]
    expect(monthTotals(rows, '2026-10').netExpenseCents).toBe(0)
    expect(categoryBreakdown(rows, '2026-10')).toHaveLength(0)
    expect(monthTotals(rows, '2026-10').count).toBe(0)
  })

  it('删除的收入不得计入可存下', () => {
    const rows = [
      row({ id: 1, date: '2026-10-01', kind: 'income', amountCents: 200000, categoryId: 9, deletedAt: '2026-10-14' }),
      row({ id: 2, date: '2026-10-02', kind: 'expense', amountCents: 10000, categoryId: CAT_FOOD }),
    ]
    expect(monthTotals(rows, '2026-10').savedCents).toBe(-10000)
  })

  it('visible / rowsOfMonth / 待补充 / 回收站 都遵守删除规则', () => {
    const rows = [
      row({ id: 1, date: '2026-10-01', kind: 'expense', amountCents: 100, pendingCategory: true }),
      row({ id: 2, date: '2026-10-02', kind: 'expense', amountCents: 200, pendingCategory: true, deletedAt: '2026-10-14' }),
      row({ id: 3, date: '2026-09-01', kind: 'expense', amountCents: 300 }),
    ]

    expect(visible(rows).map((item) => item.id)).toEqual([1, 3])
    expect(rowsOfMonth(rows, '2026-10').map((item) => item.id)).toEqual([1])
    // 已删除的待补充账目不能再出现在待办里
    expect(pendingRows(rows).map((item) => item.id)).toEqual([1])
    expect(deletedRows(rows).map((item) => item.id)).toEqual([2])
  })
})

describe('今日净支出', () => {
  it('只统计指定那一天，退款抵扣，收入不计入', () => {
    const rows = [
      row({ id: 1, date: '2026-10-14', kind: 'expense', amountCents: 8000 }),
      row({ id: 2, date: '2026-10-14', kind: 'expense', amountCents: 3000, isRefund: true }),
      row({ id: 3, date: '2026-10-14', kind: 'income', amountCents: 200000, categoryId: 9 }),
      row({ id: 4, date: '2026-10-13', kind: 'expense', amountCents: 99999 }),
    ]
    expect(dayNet(rows, '2026-10-14')).toBe(5000)
  })

  it('软删除的账目不计入今日支出', () => {
    const rows = [
      row({ id: 1, date: '2026-10-14', kind: 'expense', amountCents: 8000, deletedAt: '2026-10-14' }),
      row({ id: 2, date: '2026-10-14', kind: 'expense', amountCents: 1000 }),
    ]
    expect(dayNet(rows, '2026-10-14')).toBe(1000)
  })

  it('退款大于支出时为负', () => {
    const rows = [
      row({ id: 1, date: '2026-10-14', kind: 'expense', amountCents: 1000 }),
      row({ id: 2, date: '2026-10-14', kind: 'expense', amountCents: 3000, isRefund: true }),
    ]
    expect(dayNet(rows, '2026-10-14')).toBe(-2000)
  })

  it('当天没有支出时为 0', () => {
    expect(dayNet([], '2026-10-14')).toBe(0)
  })
})

describe('待补充与分类占比', () => {
  it('待补充按金额从大到小排序', () => {
    const rows = [
      row({ id: 1, date: '2026-10-01', kind: 'expense', amountCents: 100, pendingCategory: true }),
      row({ id: 2, date: '2026-10-02', kind: 'expense', amountCents: 900, pendingCategory: true }),
      row({ id: 3, date: '2026-10-03', kind: 'expense', amountCents: 500, pendingCategory: true }),
    ]
    expect(pendingRows(rows).map((item) => item.amountCents)).toEqual([900, 500, 100])
  })

  it('待补充的账目照常计入总支出（钱确实花了）', () => {
    const rows = [
      row({ id: 1, date: '2026-10-01', kind: 'expense', amountCents: 24000, pendingCategory: true }),
      row({ id: 2, date: '2026-10-02', kind: 'expense', amountCents: 10000, categoryId: CAT_FOOD }),
    ]
    const totals = monthTotals(rows, '2026-10')
    expect(totals.netExpenseCents).toBe(34000)
    expect(sumNet(categoryBreakdown(rows, '2026-10'))).toBe(34000)
  })

  it('分类占比按金额从大到小，占比之和为 1', () => {
    const rows = [
      row({ id: 1, date: '2026-10-01', kind: 'expense', amountCents: 7500, categoryId: CAT_FOOD }),
      row({ id: 2, date: '2026-10-02', kind: 'expense', amountCents: 2500, categoryId: CAT_SHOP }),
    ]
    const lines = categoryBreakdown(rows, '2026-10')
    expect(lines.map((line) => line.categoryId)).toEqual([CAT_FOOD, CAT_SHOP])
    expect(lines[0]?.share).toBeCloseTo(0.75, 10)
    expect(lines.reduce((sum, line) => sum + line.share, 0)).toBeCloseTo(1, 10)
  })

  it('净支出为 0 时占比为 0，不产生 NaN', () => {
    const rows = [
      row({ id: 1, date: '2026-10-01', kind: 'expense', amountCents: 5000, categoryId: CAT_FOOD }),
      row({ id: 2, date: '2026-10-02', kind: 'expense', amountCents: 5000, categoryId: CAT_FOOD, isRefund: true }),
    ]
    const lines = categoryBreakdown(rows, '2026-10')
    expect(lines[0]?.share).toBe(0)
    expect(Number.isNaN(lines[0]?.share)).toBe(false)
  })

  it('没有支出时占比表为空', () => {
    expect(categoryBreakdown([], '2026-10')).toEqual([])
  })
})
