/** 账目类型。退款不是独立类型，而是 expense 的一个标记（见 isRefund） */
export type TxKind = 'income' | 'expense'

export interface Category {
  id: number
  kind: TxKind
  name: string
  /** 排序权重，越小越靠前；也是快捷键 1-9 的排列顺序 */
  sortOrder: number
}

export interface LedgerRow {
  id: number
  /** 全局唯一标识，跨设备合并同步的去重键 */
  uuid: string
  /** YYYY-MM-DD，按本地时区 */
  date: string
  kind: TxKind
  /** 金额，单位「分」，永远为正数。方向由 kind 决定 */
  amountCents: number
  categoryId: number
  note: string
  /** 退款：抵扣支出，不计入收入 */
  isRefund?: boolean
  /** 用途待补充：钱确实花了，计入总支出，但分类待定 */
  pendingCategory?: boolean
  /** 软删除时间戳；非空表示已删除，不得计入任何统计 */
  deletedAt?: string
  /** 最后修改时间（ISO），合并同步时新的赢 */
  updatedAt: string
}
