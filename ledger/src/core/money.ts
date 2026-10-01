/**
 * 金额与日期的纯函数工具。不依赖 DOM，便于测试。
 *
 * 金额约定：一律以整数「分」存储与运算，只有渲染时才换算成元。
 * 浮点数不能用于金额，否则会出现 0.1 + 0.2 !== 0.3 这类误差。
 */

/** 把用户输入的「元」解析为「分」。非法输入返回 null，绝不猜测 */
export function parseYuanToCents(input: string): number | null {
  const text = input.trim()
  if (text === '') return null
  // 只接受正数、最多两位小数；不接受负号，因为方向由类型决定
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null

  const [yuan = '0', fraction = ''] = text.split('.')
  const cents = fraction.padEnd(2, '0')
  const value = Number(yuan) * 100 + Number(cents)
  if (!Number.isSafeInteger(value) || value <= 0) return null
  return value
}

/** 分 -> 元字符串，固定两位小数，例如 12345 -> "123.45" */
export function formatCents(cents: number): string {
  const negative = cents < 0
  const abs = Math.abs(cents)
  const yuan = Math.floor(abs / 100)
  const fraction = String(abs % 100).padStart(2, '0')
  return `${negative ? '-' : ''}${yuan}.${fraction}`
}

/** 带千分位，例如 1234567 -> "12,345.67" */
export function formatCentsGrouped(cents: number): string {
  const plain = formatCents(cents)
  const negative = plain.startsWith('-')
  const body = negative ? plain.slice(1) : plain
  const [yuan = '0', fraction = '00'] = body.split('.')
  return `${negative ? '-' : ''}${yuan.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`
}

/** 本地时区的今天，格式 YYYY-MM-DD。不能用 toISOString，会因时区偏移串档 */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** YYYY-MM-DD -> YYYY-MM */
export function monthOf(date: string): string {
  return date.slice(0, 7)
}

/** 当前月份 YYYY-MM */
export function currentMonth(now: Date = new Date()): string {
  return monthOf(todayISO(now))
}

/** 日期加减天数，返回 YYYY-MM-DD */
export function shiftDay(date: string, delta: number): string {
  const [y = '1970', m = '01', d = '01'] = date.split('-')
  const base = new Date(Number(y), Number(m) - 1, Number(d) + delta)
  return todayISO(base)
}

/** 月份加减，返回 YYYY-MM */
export function shiftMonth(month: string, delta: number): string {
  const [y = '1970', m = '01'] = month.split('-')
  const base = new Date(Number(y), Number(m) - 1 + delta, 1)
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const

/** YYYY-MM-DD -> "10-14 周二" */
export function formatDateLabel(date: string): string {
  const [y = '1970', m = '01', d = '01'] = date.split('-')
  const weekday = WEEKDAYS[new Date(Number(y), Number(m) - 1, Number(d)).getDay()] ?? ''
  return `${m}-${d} ${weekday}`
}

/** 相对今天描述日期，用于「已记在 X」这类提示 */
export function relativeDayLabel(date: string, today: string): string {
  // 注意参数顺序：dayDiff(from, to) 返回 to − from，这里要的是「今天 − 该日期」
  const diff = dayDiff(date, today)
  if (diff === 0) return '今天'
  if (diff === 1) return '昨天'
  if (diff === 2) return '前天'
  return `${date.slice(5, 7)} 月 ${date.slice(8, 10)} 日`
}

/** 两个 YYYY-MM-DD 之间相差的天数（to − from） */
export function dayDiff(from: string, to: string): number {
  const parse = (value: string): number => {
    const [y = '1970', m = '01', d = '01'] = value.split('-')
    return Date.UTC(Number(y), Number(m) - 1, Number(d))
  }
  return Math.round((parse(to) - parse(from)) / 86_400_000)
}
