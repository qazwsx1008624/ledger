/**
 * 合并式手动同步（纯函数，可测）。
 *
 * 背景：两台设备各有一份账本，各自积累。直接互相覆盖会丢掉另一边的新账目。
 * 这里的规则让「导入」变成安全的合并：
 *
 * - 账目按 uuid 全局唯一去重（uuid 由 crypto.randomUUID 生成，两台设备不会撞车）
 * - 同 uuid 两边都有：updated_at 较新的赢（包括删除状态，删除也是一种修改）
 * - 只在一侧：保留
 * - 分类按 (kind, name) 匹配：导入账目的 category_id 重映射到本地分类；
 *   本地没有的分类自动创建，因此导入的账目绝不会挂到错误分类上
 * - 无 uuid 的旧数据（旧版本导出的文件）：生成新 uuid，按新账目处理
 */
import type { Category, LedgerRow } from './types'

export interface MergeResult {
  categories: Category[]
  rows: LedgerRow[]
  /** 合并后比本地多出的账目数 */
  added: number
  /** 用导入版本覆盖更新的账目数 */
  updated: number
  /** 重映射到本地分类的账目数 */
  remapped: number
}

/** 时间比较：updated_at 为空视为最旧；格式都是 ISO 字符串，字典序即时间序 */
function newer(a: string, b: string): boolean {
  return a > b
}

export function mergeLedger(
  localCategories: readonly Category[],
  localRows: readonly LedgerRow[],
  incomingCategories: readonly Category[],
  incomingRows: readonly LedgerRow[],
): MergeResult {
  const categories = [...localCategories]
  const rows = [...localRows]

  // 分类映射：incoming 分类 id → 本地分类 id
  const categoryMap = new Map<number, number>()
  const localByName = new Map<string, Category>()
  for (const category of categories) {
    localByName.set(`${category.kind}\u0000${category.name}`, category)
  }

  let maxId = categories.reduce((max, category) => Math.max(max, category.id), 0)
  let maxRowId = rows.reduce((max, row) => Math.max(max, row.id), 0)

  for (const incoming of incomingCategories) {
    const key = `${incoming.kind}\u0000${incoming.name}`
    const existing = localByName.get(key)
    if (existing) {
      categoryMap.set(incoming.id, existing.id)
    } else {
      const created: Category = {
        ...incoming,
        id: ++maxId,
        // 若 sortOrder 与本地同类型冲突，追加到末尾
        sortOrder: categories.some((c) => c.kind === incoming.kind && c.sortOrder === incoming.sortOrder)
          ? Math.max(...categories.filter((c) => c.kind === incoming.kind).map((c) => c.sortOrder), 0) + 10
          : incoming.sortOrder,
      }
      categories.push(created)
      localByName.set(key, created)
      categoryMap.set(incoming.id, created.id)
    }
  }

  const localByUuid = new Map<string, LedgerRow>()
  for (const row of rows) {
    if (row.uuid !== '') localByUuid.set(row.uuid, row)
  }

  let added = 0
  let updated = 0
  let remapped = 0

  for (const incoming of incomingRows) {
    // 分类重映射：导入账目挂到本地分类（含刚创建的新分类）
    const localCategoryId = categoryMap.get(incoming.categoryId)
    const categoryId = localCategoryId ?? incoming.categoryId
    if (localCategoryId !== undefined && localCategoryId !== incoming.categoryId) remapped += 1

    // 旧数据没有 uuid：生成新 uuid，按新账目处理
    const uuid = incoming.uuid !== '' ? incoming.uuid : crypto.randomUUID()

    const existing = localByUuid.get(uuid)
    if (existing) {
      if (newer(incoming.updatedAt, existing.updatedAt)) {
        rows[rows.indexOf(existing)] = { ...incoming, uuid, categoryId, id: existing.id }
        updated += 1
      }
    } else {
      rows.push({ ...incoming, uuid, categoryId, id: ++maxRowId })
      localByUuid.set(uuid, rows[rows.length - 1] ?? incoming)
      added += 1
    }
  }

  return { categories, rows, added, updated, remapped }
}
