import { describe, expect, it } from 'vitest'
import {
  dayDiff,
  formatCents,
  formatCentsGrouped,
  formatDateLabel,
  monthOf,
  parseYuanToCents,
  relativeDayLabel,
  shiftDay,
  shiftMonth,
  todayISO,
} from './money'

describe('parseYuanToCents 金额解析', () => {
  it('把元解析为分', () => {
    expect(parseYuanToCents('1')).toBe(100)
    expect(parseYuanToCents('12.3')).toBe(1230)
    expect(parseYuanToCents('12.34')).toBe(1234)
    expect(parseYuanToCents('0.01')).toBe(1)
    expect(parseYuanToCents(' 5.5 ')).toBe(550)
  })

  it('拒绝非法输入，不猜测用户意图', () => {
    // 金额必须 > 0：这些都必须被拒绝，而不是被当成 0 或负数入库
    expect(parseYuanToCents('')).toBeNull()
    expect(parseYuanToCents('   ')).toBeNull()
    expect(parseYuanToCents('abc')).toBeNull()
    expect(parseYuanToCents('0')).toBeNull()
    expect(parseYuanToCents('0.00')).toBeNull()
    // 不允许负号：方向由类型决定，不靠正负号表达
    expect(parseYuanToCents('-5')).toBeNull()
    expect(parseYuanToCents('-0.01')).toBeNull()
    // 最多两位小数
    expect(parseYuanToCents('1.234')).toBeNull()
    expect(parseYuanToCents('1.2.3')).toBeNull()
    expect(parseYuanToCents('1,000')).toBeNull()
    expect(parseYuanToCents('1e3')).toBeNull()
  })

  it('不产生浮点误差', () => {
    // 0.1 + 0.2 在浮点下不等于 0.3，分成整数后必须精确
    const a = parseYuanToCents('0.1')
    const b = parseYuanToCents('0.2')
    expect(a).toBe(10)
    expect(b).toBe(20)
    expect((a ?? 0) + (b ?? 0)).toBe(parseYuanToCents('0.3'))

    // 经典浮点陷阱：19.99 * 100 在浮点下是 1998.9999999999998
    expect(parseYuanToCents('19.99')).toBe(1999)
    expect(parseYuanToCents('1234.56')).toBe(123456)
  })
})

describe('金额格式化', () => {
  it('分转元固定两位小数', () => {
    expect(formatCents(0)).toBe('0.00')
    expect(formatCents(1)).toBe('0.01')
    expect(formatCents(1234)).toBe('12.34')
    expect(formatCents(-1234)).toBe('-12.34')
  })

  it('带千分位', () => {
    expect(formatCentsGrouped(123456)).toBe('1,234.56')
    expect(formatCentsGrouped(100000000)).toBe('1,000,000.00')
    expect(formatCentsGrouped(-123456)).toBe('-1,234.56')
  })

  it('格式化的结果能被解析回原值', () => {
    for (const cents of [1, 99, 100, 12345, 999999]) {
      expect(parseYuanToCents(formatCents(cents))).toBe(cents)
    }
  })
})

describe('日期工具', () => {
  it('todayISO 用本地时区，不受 UTC 偏移影响', () => {
    // 本地时间的 1 月 1 日 00:30，用 toISOString 会退回到上一年 12 月 31 日
    const local = new Date(2026, 0, 1, 0, 30)
    expect(todayISO(local)).toBe('2026-01-01')
  })

  it('月份切换跨年正确', () => {
    expect(shiftMonth('2026-10', 1)).toBe('2026-11')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })

  it('日期加减跨月正确', () => {
    expect(shiftDay('2026-10-14', -1)).toBe('2026-10-13')
    expect(shiftDay('2026-10-01', -1)).toBe('2026-09-30')
    expect(shiftDay('2026-02-28', 1)).toBe('2026-03-01')
  })

  it('月份截取与相对日期描述', () => {
    expect(monthOf('2026-10-14')).toBe('2026-10')
    expect(relativeDayLabel('2026-10-14', '2026-10-14')).toBe('今天')
    expect(relativeDayLabel('2026-10-13', '2026-10-14')).toBe('昨天')
    expect(relativeDayLabel('2026-10-12', '2026-10-14')).toBe('前天')
    expect(relativeDayLabel('2026-10-01', '2026-10-14')).toBe('10 月 01 日')
  })

  it('日期差计算', () => {
    expect(dayDiff('2026-10-01', '2026-10-14')).toBe(13)
    expect(dayDiff('2026-10-14', '2026-10-14')).toBe(0)
    expect(dayDiff('2026-09-30', '2026-10-01')).toBe(1)
  })

  it('日期标签带星期', () => {
    // 2026-10-14 是周三
    expect(formatDateLabel('2026-10-14')).toBe('10-14 周三')
  })
})
