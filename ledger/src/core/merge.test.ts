import { describe, expect, it } from 'vitest'
import { mergeLedger } from './merge'
import type { Category, LedgerRow } from './types'

function cat(id: number, kind: 'income' | 'expense', name: string, sortOrder = 10): Category {
  return { id, kind, name, sortOrder }
}

function row(partial: Partial<LedgerRow> & Pick<LedgerRow, 'id' | 'uuid' | 'date' | 'kind' | 'amountCents'>): LedgerRow {
  return {
    categoryId: 1,
    note: '',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...partial,
  }
}

const LOCAL_CATEGORIES = [cat(1, 'expense', '饮食'), cat(2, 'expense', '购物'), cat(3, 'income', '家人生活费')]

describe('账目合并', () => {
  it('两边各自新增的账目都在，互不丢失', () => {
    const local = [row({ id: 1, uuid: 'a', date: '2026-10-01', kind: 'expense', amountCents: 1000 })]
    const incoming = [row({ id: 1, uuid: 'b', date: '2026-10-02', kind: 'expense', amountCents: 2000 })]

    const result = mergeLedger(LOCAL_CATEGORIES, local, LOCAL_CATEGORIES, incoming)
    expect(result.rows).toHaveLength(2)
    expect(result.added).toBe(1)
    expect(result.updated).toBe(0)
  })

  it('同 uuid 两边都有：updated_at 较新的赢', () => {
    const local = [
      row({ id: 1, uuid: 'a', date: '2026-10-01', kind: 'expense', amountCents: 1000, updatedAt: '2026-10-10T00:00:00.000Z' }),
    ]
    const incoming = [
      row({ id: 9, uuid: 'a', date: '2026-10-01', kind: 'expense', amountCents: 1500, note: '改过了', updatedAt: '2026-10-11T00:00:00.000Z' }),
    ]

    const result = mergeLedger(LOCAL_CATEGORIES, local, LOCAL_CATEGORIES, incoming)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]?.amountCents).toBe(1500)
    expect(result.rows[0]?.note).toBe('改过了')
    expect(result.updated).toBe(1)
  })

  it('本地较新时保留本地，不覆盖', () => {
    const local = [
      row({ id: 1, uuid: 'a', date: '2026-10-01', kind: 'expense', amountCents: 2000, updatedAt: '2026-10-12T00:00:00.000Z' }),
    ]
    const incoming = [
      row({ id: 9, uuid: 'a', date: '2026-10-01', kind: 'expense', amountCents: 100, updatedAt: '2026-10-01T00:00:00.000Z' }),
    ]
    const result = mergeLedger(LOCAL_CATEGORIES, local, LOCAL_CATEGORIES, incoming)
    expect(result.rows[0]?.amountCents).toBe(2000)
    expect(result.updated).toBe(0)
  })

  it('删除也是一种修改：较新的删除会赢', () => {
    const local = [
      row({ id: 1, uuid: 'a', date: '2026-10-01', kind: 'expense', amountCents: 1000, updatedAt: '2026-10-10T00:00:00.000Z' }),
    ]
    const incoming = [
      row({
        id: 9,
        uuid: 'a',
        date: '2026-10-01',
        kind: 'expense',
        amountCents: 1000,
        updatedAt: '2026-10-11T00:00:00.000Z',
        deletedAt: '2026-10-11',
      }),
    ]
    const result = mergeLedger(LOCAL_CATEGORIES, local, LOCAL_CATEGORIES, incoming)
    expect(result.rows[0]?.deletedAt).toBe('2026-10-11')
  })

  it('无 uuid 的旧数据按新账目处理，生成 uuid，不撞车', () => {
    const local = [row({ id: 1, uuid: 'a', date: '2026-10-01', kind: 'expense', amountCents: 1000 })]
    const incoming = [row({ id: 1, uuid: '', date: '2026-10-02', kind: 'expense', amountCents: 2000 })]

    const result = mergeLedger(LOCAL_CATEGORIES, local, LOCAL_CATEGORIES, incoming)
    expect(result.rows).toHaveLength(2)
    const merged = result.rows.find((item) => item.amountCents === 2000)
    expect(merged?.uuid).not.toBe('')
  })

  it('合并后 id 不重复', () => {
    const local = [row({ id: 1, uuid: 'a', date: '2026-10-01', kind: 'expense', amountCents: 1000 })]
    const incoming = [row({ id: 1, uuid: 'b', date: '2026-10-02', kind: 'expense', amountCents: 2000 })]
    const result = mergeLedger(LOCAL_CATEGORIES, local, LOCAL_CATEGORIES, incoming)
    const ids = result.rows.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('分类合并与重映射', () => {
  it('同名分类重映射到本地 id，账目不会挂错', () => {
    // 两台设备里「购物」的 id 不同：本地 2，导入设备上是 7
    const incomingCategories = [cat(6, 'expense', '饮食'), cat(7, 'expense', '购物'), cat(8, 'income', '家人生活费')]
    const incoming = [row({ id: 5, uuid: 'b', date: '2026-10-02', kind: 'expense', amountCents: 500, categoryId: 7 })]

    const result = mergeLedger(LOCAL_CATEGORIES, [], incomingCategories, incoming)
    expect(result.rows[0]?.categoryId).toBe(2) // 重映射到本地「购物」
    expect(result.remapped).toBe(1)
  })

  it('本地没有的分类自动创建，账目挂到新分类', () => {
    const incomingCategories = [cat(9, 'expense', '娱乐')]
    const incoming = [row({ id: 5, uuid: 'b', date: '2026-10-02', kind: 'expense', amountCents: 500, categoryId: 9 })]

    const result = mergeLedger(LOCAL_CATEGORIES, [], incomingCategories, incoming)
    const created = result.categories.find((category) => category.name === '娱乐')
    expect(created).toBeDefined()
    expect(result.rows[0]?.categoryId).toBe(created?.id)
  })

  it('同名同类型分类不重复创建', () => {
    const incomingCategories = [cat(6, 'expense', '饮食')]
    const incoming = [row({ id: 5, uuid: 'b', date: '2026-10-02', kind: 'expense', amountCents: 500, categoryId: 6 })]
    const result = mergeLedger(LOCAL_CATEGORIES, [], incomingCategories, incoming)
    expect(result.categories.filter((category) => category.name === '饮食')).toHaveLength(1)
  })
})

describe('软删除账目不参与统计（合并后依然成立）', () => {
  it('合并进来的已删除账目保留删除标记', () => {
    const incoming = [
      row({ id: 1, uuid: 'b', date: '2026-10-02', kind: 'expense', amountCents: 500, deletedAt: '2026-10-03' }),
    ]
    const result = mergeLedger(LOCAL_CATEGORIES, [], LOCAL_CATEGORIES, incoming)
    expect(result.rows[0]?.deletedAt).toBe('2026-10-03')
  })
})
