import { describe, expect, it } from 'vitest'
import { addCategory, moveCategory, removeCategory, renameCategory } from './categories'
import type { Category, LedgerRow } from './types'

const OTHER = '其他'

function cat(id: number, kind: 'income' | 'expense', name: string, sortOrder: number): Category {
  return { id, kind, name, sortOrder }
}

function row(partial: Partial<LedgerRow> & Pick<LedgerRow, 'id' | 'date' | 'kind' | 'amountCents'>): LedgerRow {
  return { categoryId: 1, note: '', ...partial }
}

const BASE_CATEGORIES = [cat(1, 'expense', '饮食', 10), cat(2, 'expense', '购物', 20), cat(3, 'income', '家人生活费', 10)]

describe('新增分类', () => {
  it('追加到同类型末尾，sortOrder 递增', () => {
    const result = addCategory(BASE_CATEGORIES, [], 'expense', ' 娱乐 ')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const added = result.categories.find((category) => category.name === '娱乐')
    expect(added?.sortOrder).toBe(30)
    expect(added?.kind).toBe('expense')
  })

  it('拒绝空名与同类型重名，但允许收支同名', () => {
    expect(addCategory(BASE_CATEGORIES, [], 'expense', '   ').ok).toBe(false)
    expect(addCategory(BASE_CATEGORIES, [], 'expense', '饮食').ok).toBe(false)
    // 收入与支出允许同名（不同组）
    expect(addCategory(BASE_CATEGORIES, [], 'income', '购物').ok).toBe(true)
  })
})

describe('重命名分类', () => {
  it('改名后账目跟随分类 id，不需要逐条改账目', () => {
    const rows = [row({ id: 1, date: '2026-10-01', kind: 'expense', amountCents: 100, categoryId: 1 })]
    const result = renameCategory(BASE_CATEGORIES, rows, 1, '吃饭')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.categories.find((category) => category.id === 1)?.name).toBe('吃饭')
    // 账目仍指向 id 1，统计自然跟随
    expect(result.rows[0]?.categoryId).toBe(1)
  })

  it('拒绝重名与空名', () => {
    expect(renameCategory(BASE_CATEGORIES, [], 1, '购物').ok).toBe(false)
    expect(renameCategory(BASE_CATEGORIES, [], 1, '  ').ok).toBe(false)
    expect(renameCategory(BASE_CATEGORIES, [], 999, 'x').ok).toBe(false)
  })
})

describe('删除分类', () => {
  it('无账目引用时直接删除', () => {
    const result = removeCategory(BASE_CATEGORIES, [], 2, '2026-10-14')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.categories.map((category) => category.id)).toEqual([1, 3])
  })

  it('删除分类时，其下未删除的账目一并软删除（进回收站，可恢复）', () => {
    const rows = [
      row({ id: 1, date: '2026-10-01', kind: 'expense', amountCents: 100, categoryId: 2 }),
      row({ id: 2, date: '2026-10-02', kind: 'expense', amountCents: 200, categoryId: 2 }),
      row({ id: 3, date: '2026-10-03', kind: 'expense', amountCents: 300, categoryId: 1 }),
    ]
    const result = removeCategory(BASE_CATEGORIES, rows, 2, '2026-10-14')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // 分类消失，不创建「其他」
    expect(result.categories.some((category) => category.id === 2)).toBe(false)
    expect(result.categories.some((category) => category.name === OTHER)).toBe(false)
    // 该分类下两笔被软删除；其他分类的账目不动
    expect(result.removedCount).toBe(2)
    expect(result.rows[0]?.deletedAt).toBe('2026-10-14')
    expect(result.rows[1]?.deletedAt).toBe('2026-10-14')
    expect(result.rows[2]?.deletedAt).toBeUndefined()
  })

  it('删除「其他」分类同样生效，不会出现「归入其他」的自指提示', () => {
    const categories = [...BASE_CATEGORIES, cat(9, 'expense', OTHER, 90)]
    const rows = [row({ id: 1, date: '2026-10-01', kind: 'expense', amountCents: 100, categoryId: 9 })]
    const result = removeCategory(categories, rows, 9, '2026-10-14')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.categories.some((category) => category.id === 9)).toBe(false)
    expect(result.removedCount).toBe(1)
    expect(result.rows[0]?.deletedAt).toBe('2026-10-14')
  })

  it('已软删除的账目保持原样，不重复标记', () => {
    const rows = [
      row({ id: 1, date: '2026-10-01', kind: 'expense', amountCents: 100, categoryId: 2 }),
      row({ id: 2, date: '2026-10-02', kind: 'expense', amountCents: 200, categoryId: 2, deletedAt: '2026-10-13' }),
    ]
    const result = removeCategory(BASE_CATEGORIES, rows, 2, '2026-10-14')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.removedCount).toBe(1)
    expect(result.rows[0]?.deletedAt).toBe('2026-10-14')
    expect(result.rows[1]?.deletedAt).toBe('2026-10-13')
  })

  it('收入分类同样连带软删其下账目', () => {
    const rows = [row({ id: 1, date: '2026-10-01', kind: 'income', amountCents: 5000, categoryId: 3 })]
    const result = removeCategory(BASE_CATEGORIES, rows, 3, '2026-10-14')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows[0]?.deletedAt).toBe('2026-10-14')
    expect(result.categories.some((category) => category.id === 3)).toBe(false)
  })
})

describe('排序', () => {
  it('上移/下移在同类型内交换位置，不跨类型', () => {
    const moved = moveCategory(BASE_CATEGORIES, 1, 1) // 饮食 与 购物 交换
    expect(moved.find((category) => category.id === 1)?.sortOrder).toBe(20)
    expect(moved.find((category) => category.id === 2)?.sortOrder).toBe(10)
    // 收入分类不受影响
    expect(moved.find((category) => category.id === 3)?.sortOrder).toBe(10)

    // 边界：已经在最上/最下则不动
    const top = moveCategory(moved, 2, -1)
    expect(top.find((category) => category.id === 2)?.sortOrder).toBe(10)
  })
})
