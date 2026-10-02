import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Category, TxKind } from '../core/types'
import { deletedRows } from '../core/stats'
import { formatCents, formatDateLabel, parseYuanToCents, todayISO } from '../core/money'
import {
  addCategoryAction,
  categoryById,
  categoryUsage,
  categoriesOfKind,
  exportBackup,
  importBackup,
  loadDemoData,
  mergeImportBytes,
  moveCategoryAction,
  removeCategoryAction,
  renameCategoryAction,
  restoreRow,
  setBudget,
  useLedger,
} from '../core/store'

/**
 * 管理页：月度预期、分类管理、回收站、数据备份。
 */
export function ManagePage() {
  const { categories, rows, budgetCents, lastBackup } = useLedger()
  const deleted = deletedRows(rows)

  return (
    <div className="page">
      <div className="page__heading">
        <h1 className="page__title">管理</h1>
        <p className="page__subtitle">预期花销、分类、回收站与数据备份</p>
      </div>

      <BudgetCard budgetCents={budgetCents} />

      <section className="card">
        <div className="card__title">
          分类管理
          <span className="card__hint">删除分类时，其下账目一并删除（可在回收站恢复）</span>
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
                  <button className="btn btn--tiny" onClick={() => void restoreRow(row.id)}>
                    恢复
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DataCard lastBackup={lastBackup} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 数据备份                                                            */
/* ------------------------------------------------------------------ */

function DataCard({ lastBackup }: { lastBackup: { at: string; count: number } | null }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const mergeFileRef = useRef<HTMLInputElement>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleExport() {
    setError(null)
    setNotice(null)
    try {
      const bytes = await exportBackup()
      const blob = new Blob([bytes], { type: 'application/vnd.sqlite3' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `ledger-${todayISO()}.sqlite`
      link.click()
      URL.revokeObjectURL(url)
      setNotice('已导出备份文件，同时记录到备份清单')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleImportFile(file: File) {
    setError(null)
    setNotice(null)
    if (!window.confirm('导入会用备份文件覆盖当前账本。当前尚未备份的改动会丢失，确定继续吗？')) return
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      await importBackup(bytes)
      setNotice('已导入备份，账本已恢复')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleMergeFile(file: File) {
    setError(null)
    setNotice(null)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const result = await mergeImportBytes(bytes)
      setNotice(
        `已合并：新增 ${result.added} 笔、更新 ${result.updated} 笔${result.remapped > 0 ? `、${result.remapped} 笔重映射分类` : ''}。两边数据都不会丢。`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (mergeFileRef.current) mergeFileRef.current.value = ''
    }
  }

  async function handleDemo() {
    setError(null)
    setNotice(null)
    if (!window.confirm('载入演示数据会清空当前所有账目（分类保留），用于体验界面。确定吗？')) return
    try {
      await loadDemoData()
      setNotice('已载入演示数据')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <section className="card">
      <div className="card__title">
        数据备份
        <span className="card__hint">账目存在这台电脑的浏览器里，换浏览器前务必导出</span>
      </div>

      <p className="data-hint">
        建议至少每月导出一次 <code>.sqlite</code> 备份。手机与电脑之间同步用「<strong>导入并合并</strong>」——两边的新账目都会保留，同一条取最新修改，不会互相覆盖丢失；「覆盖导入」只用于灾难恢复。
        {lastBackup && (
          <span className="data-hint__backup">
            上次导出：{lastBackup.at.slice(0, 10)}（{lastBackup.count} 笔）
          </span>
        )}
      </p>

      <div className="data-actions">
        <button className="btn btn--primary" onClick={() => void handleExport()}>
          导出备份
        </button>
        <button className="btn" onClick={() => mergeFileRef.current?.click()}>
          导入并合并
        </button>
        <input
          ref={mergeFileRef}
          type="file"
          accept=".sqlite,.db,.sqlite3"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void handleMergeFile(file)
          }}
        />
        <button className="btn" onClick={() => fileRef.current?.click()}>
          覆盖导入
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".sqlite,.db,.sqlite3"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void handleImportFile(file)
          }}
        />
        <button className="btn btn--ghost" onClick={() => void handleDemo()}>
          载入演示数据
        </button>
      </div>

      {notice && <div className="notice notice--ok">{notice}</div>}
      {error && <div className="notice notice--error">{error}</div>}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* 月度预期                                                            */
/* ------------------------------------------------------------------ */

function BudgetCard({ budgetCents }: { budgetCents: number | null }) {
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState(() => (budgetCents === null ? '' : formatCents(budgetCents)))
  const [error, setError] = useState<string | null>(null)

  async function save(event: FormEvent) {
    event.preventDefault()
    const cents = parseYuanToCents(input)
    if (cents === null) {
      setError('请填写大于 0 的金额，最多两位小数')
      return
    }
    setError(null)
    await setBudget(cents)
    setEditing(false)
  }

  return (
    <section className="card budget-card">
      <div className="card__title">本月预期花销</div>
      {editing ? (
        <form className="budget-form" onSubmit={(event) => void save(event)}>
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
                  void setBudget(null)
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

  async function submitAdd(event: FormEvent) {
    event.preventDefault()
    const result = await addCategoryAction(kind, newName)
    if (result !== null) {
      setError(result)
      return
    }
    setError(null)
    setNewName('')
    setAdding(false)
  }

  async function submitRename(event: FormEvent) {
    event.preventDefault()
    if (renaming === null) return
    const result = await renameCategoryAction(renaming, renameText)
    if (result !== null) {
      setError(result)
      return
    }
    setError(null)
    setRenaming(null)
  }

  async function handleDelete(category: Category) {
    const usage = categoryUsage(rows, category.id)
    const result = await removeCategoryAction(category.id)
    if (result !== null) {
      setError(result)
      return
    }
    setError(usage > 0 ? `已删除「${category.name}」及其下 ${usage} 笔账目（可在回收站恢复）` : `已删除「${category.name}」`)
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
                <form className="cat-manage__rename" onSubmit={(event) => void submitRename(event)}>
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
                      onClick={() => void moveCategoryAction(category.id, -1)}
                      aria-label="上移"
                    >
                      ↑
                    </button>
                    <button
                      className="icon-mini"
                      disabled={index === list.length - 1}
                      onClick={() => void moveCategoryAction(category.id, 1)}
                      aria-label="下移"
                    >
                      ↓
                    </button>
                  </span>
                  <span className="cat-manage__name">{category.name}</span>
                  <span className="cat-manage__usage">{categoryUsage(rows, category.id)} 笔</span>

                  {confirmDelete === category.id ? (
                    <span className="cat-manage__confirm">
                      <button
                        className="btn btn--tiny btn--danger-solid"
                        onClick={() => void handleDelete(category)}
                      >
                        删除分类和账目
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
        <form className="cat-manage__add" onSubmit={(event) => void submitAdd(event)}>
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
