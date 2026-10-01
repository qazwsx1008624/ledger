/**
 * 金额与日期的基础工具。
 * 约定：金额一律用「分」(integer) 存储和计算，只有在渲染时才转成「元」。
 */

/** 把用户输入的元字符串解析为分；非法输入返回 null */
export function parseYuanToCents(input: string): number | null {
  const text = input.trim()
  if (text === '') return null
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null

  const [yuan = '0', fraction = ''] = text.split('.')
  const cents = fraction.padEnd(2, '0')
  const value = Number(yuan) * 100 + Number(cents)
  return Number.isSafeInteger(value) ? value : null
}

/** 把分格式化为带两位小数的元字符串，例如 12345 -> "123.45" */
export function formatCents(cents: number): string {
  const negative = cents < 0
  const abs = Math.abs(cents)
  const yuan = Math.floor(abs / 100)
  const fraction = String(abs % 100).padStart(2, '0')
  return `${negative ? '-' : ''}${yuan}.${fraction}`
}

/** 带千分位的金额显示，例如 1234567 -> "12,345.67" */
export function formatCentsGrouped(cents: number): string {
  const plain = formatCents(cents)
  const negative = plain.startsWith('-')
  const body = negative ? plain.slice(1) : plain
  const [yuan = '0', fraction = '00'] = body.split('.')
  const grouped = yuan.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}${grouped}.${fraction}`
}

/** 本地时区的今天，格式 YYYY-MM-DD（不用 toISOString，避免 UTC 偏移串日期） */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 从 YYYY-MM-DD 取出 YYYY-MM */
export function monthOf(date: string): string {
  return date.slice(0, 7)
}

/** 当前月份，格式 YYYY-MM */
export function currentMonth(now: Date = new Date()): string {
  return monthOf(todayISO(now))
}

/** 月份加减，返回 YYYY-MM */
export function shiftMonth(month: string, delta: number): string {
  const [y = '1970', m = '01'] = month.split('-')
  const base = new Date(Number(y), Number(m) - 1 + delta, 1)
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`
}
