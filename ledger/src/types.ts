/** 一条账目：收入或支出 */
export type TxKind = 'expense' | 'income'

export interface Tx {
  id: number
  /** 记账日期，格式 YYYY-MM-DD */
  date: string
  kind: TxKind
  /** 金额，单位「分」。用整数存储，避免浮点误差 */
  amountCents: number
  /** 分类名，对应 categories.name */
  category: string
  /** 备注，可为空 */
  note: string
}

/** 新增账目时传入的字段（id 由数据库生成） */
export type TxDraft = Omit<Tx, 'id'>

export interface Category {
  name: string
  kind: TxKind
  /** 排序权重，越小越靠前 */
  sortOrder: number
}

/** 某个月的收支汇总，金额单位为分 */
export interface MonthlySummary {
  incomeCents: number
  expenseCents: number
  balanceCents: number
  count: number
}
