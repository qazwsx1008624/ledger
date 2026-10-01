import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Category, TxKind } from '../core/types'
import { deletedRows } from '../core/stats'
import { formatCents, formatDateLabel, parseYuanToCents } from '../core/money'
import {
  addCategoryAction,
  categoryById,
  categoryUsage,
  categoriesOfKind,
  moveCategoryAction,
  removeCategoryAction,
  renameCategoryAction,
  restoreRow,
  setBudget,
  useLedger,
} from '../core/store'

/**
 * 管理页：月度预期、分类管理、回收站。
 * 用户反馈「找不到改月预期和编辑分类的地方」——就是这里。
 */
export function ManagePage() {
  const { categories, rows, budgetCents } = useLedger()
  const deleted = deletedRows(rows)

  return (
    <div className="page">
      <div className="page__heading">
        <h1 className="page__title">管理</h1>
        <p className="page__subtitle">预期花销、分类与回收站</p>
      </div>

      <BudgetCard budgetCents={budgetCents} />

      <section className="card">
        <div className="card__title">
          分类管理
          <span className="card__hint">删除分类时，已有账目会归入「其他」</span>
        </div>
        <CategoryGroup kind="expense" title="支出分类" />
        <CategoryGroup kind="income" title="收入分类" />
      </section>

      <section className="card">
        <div className="card__title">
          回收站
          <span className="card__hint">已删除的账目不计入统计</span>
        </div>
        {deleted.length === 0 ? (
          <div className="empty">回收站是空的</div>
        ) : (
          <ul className="tx-list">
            {deleted.map((row) => (
              <li key={row.id}>
                <div className="recycle-row">
                  <span className="tx-row__icon">🗑</span>
                  <span className="tx-row__main">
                    <span className="tx-row__category">
                      {categoryById(categories, row.categoryId)?.name ?? '未知'}
                      {row.note && <span className="tx-row__note">{row.note}</span>}
                    </span>
                    <span className="tx-row__date">{formatDateLabel(row.date)}</span>
                  </span>
                  <span className="tx-row__amount">¥{formatCents(row.amountCents)}</span>
                  <button className="btn btn--tiny" onClick={() => restoreRow(row.id)}>
                    恢复
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 月度预期                                                            */
/* ------------------------------------------------------------------ */

function BudgetCard({ budgetCents }: { budgetCents: number | null }) {
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState(() => (budgetCents === null ? '' : formatCents(budgetCents)))
  const [error, setError] = useState<string | null>(null)

  function save(event: FormEvent) {
    event.preventDefault()
    const cents = parseYuanToCents(input)
    if (cents === null) {
      setError('请填写大于 0 的金额，最多两位小数')
      return
    }
    setError(null)
    setBudget(cents)
    setEditing(false)
  }

  return (
    <section className="card budget-card">
      <div className="card__title">本月预期花销</div>
      {editing ? (
        <form className="budget-form" onSubmit={save}>
          <div className="budget-form__row">
            <span className="field-symbol">¥</span>
            <input
              className="field-amount"
              type="text"
              inputMode="decimal"
              placeholder="例如 2000"
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
          </div>
          {error && <div className="notice notice--error">{error}</div>}
          <div className="budget-form__actions">
            <button className="btn btn--primary" type="submit">
              保存
            </button>
            <button className="btn btn--ghost" type="button" onClick={() => setEditing(false)}>
              取消
            </button>
          </div>
        </form>
      ) : (
        <div className="budget-view">
          <span className="budget-view__value">
            {budgetCents === null ? '未设置' : `¥${formatCents(budgetCents)} / 月`}
          </span>
          <span className="budget-view__actions">
            {budgetCents !== null && (
              <button
                className="btn btn--tiny"
                onClick={() => {
                  setBudget(null)
                  setInput('')
                }}
              >
                清除
              </button>
            )}
            <button className="btn btn--tiny btn--primary" onClick={() => setEditing(true)}>
              {budgetCents === null ? '设置' : '修改'}
            </button>
          </span>
        </div>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* 分类分组                                                            */
/* ------------------------------------------------------------------ */

function CategoryGroup({ kind, title }: { kind: TxKind; title: string }) {
  const { categories, rows } = useLedger()
  const list = categoriesOfKind(categories, kind)

  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState<number | null>(null)
  const [renameText, setRenameText] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  function submitAdd(event: FormEvent) {
    event.preventDefault()
    const result = addCategoryAction(kind, newName)
    if (result !== null) {
      setError(result)
      return
    }
    setError(null)
    setNewName('')
    setAdding(false)
  }

  function submitRename(event: FormEvent) {
    event.preventDefault()
    if (renaming === null) return
    const result = renameCategoryAction(renaming, renameText)
    if (result !== null) {
      setError(result)
      return
    }
    setError(null)
    setRenaming(null)
  }

  function handleDelete(category: Category) {
    const usage = categoryUsage(rows, category.id)
    const result = removeCategoryAction(category.id)
    if (result !== null) {
      setError(result)
      return
    }
    setError(usage > 0 ? `已删除「${category.name}」，${usage} 笔账目归入「其他」` : null)
    setConfirmDelete(null)
  }

  return (
    <div className="cat-group">
      <h3 className="cat-group__title">{title}</h3>

      {list.length === 0 ? (
        <div className="empty">还没有分类</div>
      ) : (
        <ul className="cat-manage">
          {list.map((category, index) => (
            <li key={category.id}>
              {renaming === category.id ? (
                <form className="cat-manage__rename" onSubmit={submitRename}>
                  <input
                    value={renameText}
                    onChange={(event) => setRenameText(event.target.value)}
                    autoFocus
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') setRenaming(null)
                    }}
                  />
                  <button className="btn btn--tiny btn--primary" type="submit">
                    确定
                  </button>
                  <button className="btn btn--tiny" type="button" onClick={() => setRenaming(null)}>
                    取消
                  </button>
                </form>
              ) : (
                <div className="cat-manage__row">
                  <span className="cat-manage__order">
                    <button
                      className="icon-mini"
                      disabled={index === 0}
                      onClick={() => moveCategoryAction(category.id, -1)}
                      aria-label="上移"
                    >
                      ↑
                    </button>
                    <button
                      className="icon-mini"
                      disabled={index === list.length - 1}
                      onClick={() => moveCategoryAction(category.id, 1)}
                      aria-label="下移"
                    >
                      ↓
                    </button>
                  </span>
                  <span className="cat-manage__name">{category.name}</span>
                  <span className="cat-manage__usage">{categoryUsage(rows, category.id)} 笔</span>

                  {confirmDelete === category.id ? (
                    <span className="cat-manage__confirm">
                      <button className="btn btn--tiny btn--danger-solid" onClick={() => handleDelete(category)}>
                        删除并归入其他
                      </button>
                      <button className="btn btn--tiny" onClick={() => setConfirmDelete(null)}>
                        取消
                      </button>
                    </span>
                  ) : (
                    <span className="cat-manage__actions">
                      <button
                        className="btn btn--tiny"
                        onClick={() => {
                          setRenaming(category.id)
                          setRenameText(category.name)
                          setError(null)
                        }}
                      >
                        改名
                      </button>
                      <button
                        className="btn btn--tiny btn--danger"
                        onClick={() => {
                          setConfirmDelete(category.id)
                          setError(null)
                        }}
                      >
                        删除
                      </button>
                    </span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <div className="notice notice--info">{error}</div>}

      {adding ? (
        <form className="cat-manage__add" onSubmit={submitAdd}>
          <input
            placeholder="新分类名称"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            autoFocus
            onKeyDown={(event) => {
              if (event.key === 'Escape') setAdding(false)
            }}
          />
          <button className="btn btn--tiny btn--primary" type="submit">
            添加
          </button>
          <button className="btn btn--tiny" type="button" onClick={() => setAdding(false)}>
            取消
          </button>
        </form>
      ) : (
        <button className="btn btn--dashed" onClick={() => setAdding(true)}>
          + 新增分类
        </button>
      )}
    </div>
  )
}
