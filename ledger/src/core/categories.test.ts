import { describe, expect, it } from 'vitest'
import { addCategory, FALLBACK_CATEGORY, moveCategory, removeCategory, renameCategory } from './categories'
import type { Category, LedgerRow } from './types'

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
    const result = removeCategory(BASE_CATEGORIES, [], 2)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.categories.map((category) => category.id)).toEqual([1, 3])
  })

  it('有账目引用时，账目迁移到自动创建的「其他」，绝不丢账', () => {
    const rows = [
      row({ id: 1, date: '2026-10-01', kind: 'expense', amountCents: 100, categoryId: 2 }),
      row({ id: 2, date: '2026-10-02', kind: 'expense', amountCents: 200, categoryId: 2 }),
    ]
    const result = removeCategory(BASE_CATEGORIES, rows, 2)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const fallback = result.categories.find((category) => category.name === FALLBACK_CATEGORY)
    expect(fallback).toBeDefined()
    expect(fallback?.kind).toBe('expense')
    // 两笔账目都指向「其他」
    expect(result.rows.every((item) => item.categoryId === fallback?.id)).toBe(true)
    // 原分类消失
    expect(result.categories.some((category) => category.id === 2)).toBe(false)
  })

  it('软删除的账目也一并迁移，保证恢复后仍有有效分类', () => {
    const rows = [
      row({ id: 1, date: '2026-10-01', kind: 'expense', amountCents: 100, categoryId: 2 }),
      row({ id: 2, date: '2026-10-02', kind: 'expense', amountCents: 200, categoryId: 2, deletedAt: '2026-10-14' }),
    ]
    const result = removeCategory(BASE_CATEGORIES, rows, 2)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows[0]?.categoryId).not.toBe(2)
    expect(result.rows[1]?.categoryId).not.toBe(2)
  })

  it('收入分类同样迁移到收入侧的「其他」', () => {
    const rows = [row({ id: 1, date: '2026-10-01', kind: 'income', amountCents: 5000, categoryId: 3 })]
    const result = removeCategory(BASE_CATEGORIES, rows, 3)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const fallback = result.categories.find((category) => category.name === FALLBACK_CATEGORY)
    expect(fallback?.kind).toBe('income')
    expect(result.rows[0]?.categoryId).toBe(fallback?.id)
  })

  it('若「其他」已存在则复用，不重复创建', () => {
    const categories = [...BASE_CATEGORIES, cat(9, 'expense', FALLBACK_CATEGORY, 90)]
    const rows = [row({ id: 1, date: '2026-10-01', kind: 'expense', amountCents: 100, categoryId: 2 })]
    const result = removeCategory(categories, rows, 2)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.categories.filter((category) => category.name === FALLBACK_CATEGORY)).toHaveLength(1)
    expect(result.rows[0]?.categoryId).toBe(9)
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
