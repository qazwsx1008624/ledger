import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { LedgerRow, TxKind } from './core/types'
import {
  formatCents,
  formatCentsGrouped,
  formatDateLabel,
  monthOf,
  parseYuanToCents,
  relativeDayLabel,
  shiftDay,
  shiftMonth,
} from './core/money'
import { categoryBreakdown, dailyStats, deletedRows, monthTotals, pendingRows, sumNet } from './core/stats'
import {
  addRow,
  categoriesOfKind,
  categoryById,
  removeRow,
  restoreRow,
  setBudget,
  updateRow,
  useLedger,
} from './core/store'

export default function App() {
  const state = useLedger()
  const { referenceDate, categories, rows, budgetCents } = state

  const [month, setMonth] = useState(() => monthOf(referenceDate))
  const [page, setPage] = useState<'main' | 'triage'>('main')
  const [undo, setUndo] = useState<{ id: number; label: string } | null>(null)

  const pending = useMemo(() => pendingRows(rows), [rows])
  const deleted = useMemo(() => deletedRows(rows), [rows])

  function handleDelete(row: LedgerRow) {
    const category = categoryById(categories, row.categoryId)?.name ?? '未知分类'
    removeRow(row.id)
    setUndo({ id: row.id, label: `${formatDateLabel(row.date)} ${category} ¥${formatCents(row.amountCents)}` })
  }

  // 撤销提示条 6 秒后自动消失，但账目仍在回收站里可恢复
  useEffect(() => {
    if (!undo) return
    const timer = setTimeout(() => setUndo(null), 6000)
    return () => clearTimeout(timer)
  }, [undo])

  if (page === 'triage') {
    return <TriagePage onDone={() => setPage('main')} />
  }

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1 className="app__title">生活费记账本</h1>
          <p className="app__subtitle">
            {formatDateLabel(referenceDate)} · 数据存在浏览器本地，不上传任何服务器
          </p>
        </div>
        <button className="btn btn--ghost" onClick={() => setPage('triage')}>
          用途待补充
          <span className={pending.length > 0 ? 'badge badge--alert' : 'badge'}>{pending.length}</span>
        </button>
      </header>

      <div className="notice notice--warn">
        <strong>这是交互演示版本。</strong>
        数据是内置的模拟数据，改动只存在内存里，<strong>刷新页面即重置</strong>。
        统计口径已用测试守住（净支出 = 支出 − 退款、软删除不计入合计）。
      </div>

      <EntryPanel
        referenceDate={referenceDate}
        categories={categories}
        recent={[...rows]
          .filter((row) => row.deletedAt === undefined)
          .sort((a, b) => b.id - a.id)
          .slice(0, 3)}
        onDelete={handleDelete}
      />

      <DailyPanel
        rows={rows}
        month={monthOf(referenceDate)}
        today={referenceDate}
        budgetCents={budgetCents}
        onBudgetChange={setBudget}
      />

      <MonthPanel
        rows={rows}
        categories={categories}
        month={month}
        onMonthChange={setMonth}
        referenceDate={referenceDate}
      />

      {deleted.length > 0 && (
        <section className="card">
          <h2 className="card__title">
            回收站
            <span className="card__hint">已删除的账目不计入任何统计，可以恢复</span>
          </h2>
          <ul className="recycle">
            {deleted.slice(0, 6).map((row) => (
              <li key={row.id}>
                <span className="muted">
                  {formatDateLabel(row.date)} {categoryById(categories, row.categoryId)?.name}
                </span>
                <span className="num">¥{formatCents(row.amountCents)}</span>
                <button className="btn btn--tiny" onClick={() => restoreRow(row.id)}>
                  恢复
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {undo && (
        <div className="snackbar">
          <span>已删除 {undo.label}</span>
          <button
            className="btn btn--tiny btn--onDark"
            onClick={() => {
              restoreRow(undo.id)
              setUndo(null)
            }}
          >
            撤销
          </button>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 快速录入                                                            */
/* ------------------------------------------------------------------ */

interface EntryPanelProps {
  referenceDate: string
  categories: ReturnType<typeof useLedger>['categories']
  recent: LedgerRow[]
  onDelete: (row: LedgerRow) => void
}

function EntryPanel({ referenceDate, categories, recent, onDelete }: EntryPanelProps) {
  const [kind, setKind] = useState<TxKind>('expense')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(referenceDate)
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [isRefund, setIsRefund] = useState(false)
  const [pendingCategory, setPendingCategory] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const amountRef = useRef<HTMLInputElement>(null)
  const options = categoriesOfKind(categories, kind)

  // 打开即聚焦金额框，手不用离开键盘
  useEffect(() => {
    amountRef.current?.focus()
  }, [kind])

  // 切换收入/支出后，若当前分类不属于该类型则改选第一个
  useEffect(() => {
    if (options.length === 0) return
    if (categoryId === null || !options.some((option) => option.id === categoryId)) {
      setCategoryId(options[0]?.id ?? null)
    }
  }, [options, categoryId])

  // 切回支出时自动取消只有收入才有的状态
  useEffect(() => {
    if (kind === 'income') {
      setIsRefund(false)
      setPendingCategory(false)
    }
  }, [kind])

  function submit(event: FormEvent) {
    event.preventDefault()
    if (saving) return

    const cents = parseYuanToCents(amount)
    if (cents === null) {
      setError('金额请填写大于 0 的数字，最多两位小数')
      return
    }
    if (!pendingCategory && categoryId === null) {
      setError('请选择分类')
      return
    }

    setError(null)
    setSaving(true)
    try {
      addRow({
        date,
        kind,
        amountCents: cents,
        categoryId: categoryId ?? 0,
        note: note.trim(),
        ...(isRefund ? { isRefund: true } : {}),
        ...(pendingCategory ? { pendingCategory: true } : {}),
      })

      // 保存后清空金额与备注、光标回到金额框，可以连续记下一笔
      setAmount('')
      setNote('')
      setSaved(`${relativeDayLabel(date, referenceDate)}（${date}）`)
      amountRef.current?.focus()
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card card--entry">
      <h2 className="card__title">
        记一笔
        <span className="card__hint">金额敲完直接按回车</span>
      </h2>

      <form onSubmit={submit}>
        <div className="entry__row">
          <div className="segmented">
            <button
              type="button"
              className={kind === 'expense' ? 'segmented__item is-active' : 'segmented__item'}
              onClick={() => setKind('expense')}
            >
              支出
            </button>
            <button
              type="button"
              className={kind === 'income' ? 'segmented__item is-active' : 'segmented__item'}
              onClick={() => setKind('income')}
            >
              收入
            </button>
          </div>

          <div className="amount-input">
            <span className="amount-input__symbol">¥</span>
            <input
              ref={amountRef}
              className="amount-input__field"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>

          <div className="date-picker">
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            <button type="button" className="btn btn--tiny" onClick={() => setDate(referenceDate)}>
              今天
            </button>
            <button type="button" className="btn btn--tiny" onClick={() => setDate(shiftDay(referenceDate, -1))}>
              昨天
            </button>
            <button type="button" className="btn btn--tiny" onClick={() => setDate(shiftDay(referenceDate, -2))}>
              前天
            </button>
          </div>
        </div>

        <div className="chips">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              className={categoryId === option.id && !pendingCategory ? 'chip is-active' : 'chip'}
              onClick={() => {
                setCategoryId(option.id)
                setPendingCategory(false)
              }}
            >
              {option.name}
            </button>
          ))}

          {kind === 'expense' && (
            <>
              <button
                type="button"
                className={pendingCategory ? 'chip chip--pending is-active' : 'chip chip--pending'}
                onClick={() => setPendingCategory(true)}
              >
                用途待补充
              </button>
              <label className="check">
                <input type="checkbox" checked={isRefund} onChange={(event) => setIsRefund(event.target.checked)} />
                这是退款
              </label>
            </>
          )}
        </div>

        <div className="entry__row entry__row--bottom">
          <input
            className="note-input"
            type="text"
            placeholder="备注（哪怕写两个字，事后才想得起来）"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <button className="btn btn--primary" type="submit" disabled={saving}>
            保存
          </button>
        </div>
      </form>

      {error && <div className="notice notice--error">{error}</div>}
      {saved && !error && (
        <div className="notice notice--ok">
          已记在 {saved}
          {pendingCategory && ' · 待补充用途'}
          {isRefund && ' · 记为退款'}
        </div>
      )}

      <div className="recent">
        <div className="recent__title">最近 3 笔（记错了直接在这里改）</div>
        <ul className="recent__list">
          {recent.map((row) => (
            <RecentItem key={row.id} row={row} categories={categories} onDelete={onDelete} />
          ))}
        </ul>
      </div>
    </section>
  )
}

interface RecentItemProps {
  row: LedgerRow
  categories: ReturnType<typeof useLedger>['categories']
  onDelete: (row: LedgerRow) => void
}

function RecentItem({ row, categories, onDelete }: RecentItemProps) {
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState(() => formatCents(row.amountCents))
  const [note, setNote] = useState(row.note)

  const category = categoryById(categories, row.categoryId)

  function save() {
    const cents = parseYuanToCents(amount)
    if (cents === null) return
    updateRow(row.id, { amountCents: cents, note: note.trim() })
    setEditing(false)
  }

  return (
    <li>
      {editing ? (
        <div className="recent__edit">
          <input
            className="recent__amount"
            value={amount}
            inputMode="decimal"
            onChange={(event) => setAmount(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') save()
              if (event.key === 'Escape') setEditing(false)
            }}
          />
          <input
            className="recent__note"
            value={note}
            placeholder="备注"
            onChange={(event) => setNote(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') save()
              if (event.key === 'Escape') setEditing(false)
            }}
          />
          <button className="btn btn--tiny btn--primary" onClick={save}>
            保存
          </button>
          <button className="btn btn--tiny" onClick={() => setEditing(false)}>
            取消
          </button>
        </div>
      ) : (
        <>
          <span className="muted recent__date">{formatDateLabel(row.date)}</span>
          <span className={row.kind === 'income' ? 'tag tag--income' : 'tag'}>
            {row.pendingCategory ? '用途待补充' : (category?.name ?? '未知')}
          </span>
          <span className="recent__note-text muted">{row.note || '—'}</span>
          <span className={row.kind === 'income' ? 'num num--income' : 'num num--expense'}>
            {row.kind === 'income' ? '+' : row.isRefund ? '退 ' : '-'}¥{formatCents(row.amountCents)}
          </span>
          <button className="btn btn--tiny" onClick={() => setEditing(true)}>
            改
          </button>
          <button className="btn btn--tiny btn--danger" onClick={() => onDelete(row)}>
            删
          </button>
        </>
      )}
    </li>
  )
}

/* ------------------------------------------------------------------ */
/* 每日统计                                                            */
/* ------------------------------------------------------------------ */

interface DailyPanelProps {
  rows: LedgerRow[]
  month: string
  today: string
  budgetCents: number | null
  onBudgetChange: (cents: number | null) => void
}

function DailyPanel({ rows, month, today, budgetCents, onBudgetChange }: DailyPanelProps) {
  const stats = dailyStats(rows, month, today, budgetCents)
  const [editingBudget, setEditingBudget] = useState(false)
  const [budgetInput, setBudgetInput] = useState(() => (budgetCents === null ? '' : formatCents(budgetCents)))

  const over = stats.allowanceCents !== null && stats.allowanceCents < 0

  return (
    <section className="card">
      <h2 className="card__title">
        今天
        <span className="card__hint">{formatDateLabel(today)}</span>
      </h2>

      <div className="today">
        <div className="today__hero">
          <div className="today__label">今日支出</div>
          <div className="today__value">¥{formatCentsGrouped(stats.todayCents)}</div>
        </div>

        <div className="today__side">
          <div>
            <span className="today__label">本月累计</span>
            <strong>¥{formatCentsGrouped(stats.monthToDateCents)}</strong>
          </div>
          <div>
            <span className="today__label">本月日均</span>
            <strong>¥{formatCentsGrouped(stats.dailyAverageCents)}</strong>
          </div>
          <div>
            <span className="today__label">
              {stats.allowanceCents === null ? '本月预期' : `剩余 ${stats.remainingDays} 天每日可用`}
            </span>
            {stats.allowanceCents === null ? (
              editingBudget ? (
                <span className="budget-edit">
                  <input
                    value={budgetInput}
                    inputMode="decimal"
                    placeholder="2000"
                    onChange={(event) => setBudgetInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        const cents = parseYuanToCents(budgetInput)
                        onBudgetChange(cents)
                        setEditingBudget(false)
                      }
                      if (event.key === 'Escape') setEditingBudget(false)
                    }}
                  />
                  <button
                    className="btn btn--tiny btn--primary"
                    onClick={() => {
                      onBudgetChange(parseYuanToCents(budgetInput))
                      setEditingBudget(false)
                    }}
                  >
                    确定
                  </button>
                </span>
              ) : (
                <button className="link" onClick={() => setEditingBudget(true)}>
                  设定预期花销
                </button>
              )
            ) : (
              <strong className={over ? 'value--over' : 'value--ok'}>
                ¥{formatCentsGrouped(stats.allowanceCents)}
                {over && <span className="today__over"> 已超预期</span>}
              </strong>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* 月度统计                                                            */
/* ------------------------------------------------------------------ */

interface MonthPanelProps {
  rows: LedgerRow[]
  categories: ReturnType<typeof useLedger>['categories']
  month: string
  onMonthChange: (updater: (month: string) => string) => void
  referenceDate: string
}

function MonthPanel({ rows, categories, month, onMonthChange, referenceDate }: MonthPanelProps) {
  const totals = monthTotals(rows, month)
  const prev = monthTotals(rows, shiftMonth(month, -1))
  const lines = categoryBreakdown(rows, month)
  const netSum = sumNet(lines)
  const maxNet = lines.reduce((max, line) => Math.max(max, line.netCents), 0)

  const diff = totals.netExpenseCents - prev.netExpenseCents
  const diffRatio = prev.netExpenseCents > 0 ? diff / prev.netExpenseCents : null

  return (
    <>
      <section className="card">
        <div className="month-nav">
          <button className="btn btn--tiny" onClick={() => onMonthChange((value) => shiftMonth(value, -1))}>
            ← 上月
          </button>
          <span className="month-nav__label">{month}</span>
          <button className="btn btn--tiny" onClick={() => onMonthChange((value) => shiftMonth(value, 1))}>
            下月 →
          </button>
          <button className="btn btn--tiny" onClick={() => onMonthChange(() => monthOf(referenceDate))}>
            回到本月
          </button>
        </div>

        <div className="summary">
          <div className="summary__item">
            <div className="summary__label">收入</div>
            <div className="summary__value value--ok">¥{formatCentsGrouped(totals.incomeCents)}</div>
          </div>
          <div className="summary__item">
            <div className="summary__label">净支出</div>
            <div className="summary__value value--expense">¥{formatCentsGrouped(totals.netExpenseCents)}</div>
          </div>
          <div className="summary__item">
            <div className="summary__label">退款</div>
            <div className="summary__value">¥{formatCentsGrouped(totals.refundCents)}</div>
          </div>
          <div className="summary__item">
            <div className="summary__label">可存下</div>
            <div className="summary__value">¥{formatCentsGrouped(totals.savedCents)}</div>
          </div>
        </div>

        <p className="formula">
          净支出 = 支出 ¥{formatCentsGrouped(totals.expenseCents)} − 退款 ¥{formatCentsGrouped(totals.refundCents)}
          ＝ ¥{formatCentsGrouped(totals.netExpenseCents)}；可存下 = 收入 − 净支出 ＝ ¥
          {formatCentsGrouped(totals.savedCents)} · 共 {totals.count} 笔
        </p>

        {prev.netExpenseCents > 0 && (
          <p className={diff > 0 ? 'compare compare--up' : 'compare compare--down'}>
            比上月{diff > 0 ? '多花' : '少花'} ¥{formatCentsGrouped(Math.abs(diff))}
            {diffRatio !== null && `（${diff > 0 ? '+' : '-'}${Math.round(Math.abs(diffRatio) * 100)}%）`}
          </p>
        )}
      </section>

      <section className="card">
        <h2 className="card__title">
          分类占比
          <span className="card__hint">按净额排列，退款已抵扣</span>
        </h2>

        {lines.length === 0 ? (
          <div className="empty">{month} 没有支出记录</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>分类</th>
                <th className="num">净支出</th>
                <th className="num">占比</th>
                <th className="num">笔数</th>
                <th style={{ width: '26%' }} />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.categoryId}>
                  <td>{categoryById(categories, line.categoryId)?.name ?? '未知分类'}</td>
                  <td className="num">¥{formatCentsGrouped(line.netCents)}</td>
                  <td className="num">{(line.share * 100).toFixed(1)}%</td>
                  <td className="num muted">{line.count}</td>
                  <td>
                    <span className="bar">
                      <span
                        className="bar__fill"
                        style={{ width: maxNet > 0 ? `${(line.netCents / maxNet) * 100}%` : '0%' }}
                      />
                    </span>
                    {line.refundCents > 0 && (
                      <span className="bar__refund">含退款 ¥{formatCentsGrouped(line.refundCents)}</span>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="table__total">
                <td>合计</td>
                <td className="num">¥{formatCentsGrouped(netSum)}</td>
                <td className="num">100%</td>
                <td className="num muted">{totals.count}</td>
                <td />
              </tr>
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* 用途待补充 · 快捷键逐笔分类                                          */
/* ------------------------------------------------------------------ */

function TriagePage({ onDone }: { onDone: () => void }) {
  const { rows, categories } = useLedger()
  const [skipped, setSkipped] = useState<ReadonlySet<number>>(() => new Set())
  const [flash, setFlash] = useState<string | null>(null)

  // 待补充按金额从大到小；被跳过的移到队尾，本轮不再打扰
  const queue = useMemo(() => {
    const list = pendingRows(rows)
    return [...list.filter((row) => !skipped.has(row.id)), ...list.filter((row) => skipped.has(row.id))]
  }, [rows, skipped])

  // 分类超过 9 个时，数字键只覆盖前 9 个（用户可调整顺序），其余用鼠标点
  const expenseCategories = useMemo(() => categoriesOfKind(categories, 'expense'), [categories])
  const shortcuts = expenseCategories.slice(0, 9)

  const current = queue[0]

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!current) return
      if (event.key === 'Escape' || event.key === ' ') {
        event.preventDefault()
        skipCurrent()
        return
      }
      const index = Number(event.key) - 1
      const target = shortcuts[index]
      if (!target) return
      event.preventDefault()
      // 归类后必须同时清掉待补充标记，否则它会永远留在待办里
      updateRow(current.id, { categoryId: target.id, pendingCategory: false })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  function skipCurrent() {
    if (!current) return
    setSkipped((previous) => new Set(previous).add(current.id))
    setFlash('已跳过，本轮稍后再出现。想不起来就先放着，别随便选一个')
  }

  function assign(row: LedgerRow, categoryId: number) {
    updateRow(row.id, { categoryId, pendingCategory: false })
  }

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1 className="app__title">用途待补充</h1>
          <p className="app__subtitle">按数字键归类，一笔一次按键，不用碰鼠标</p>
        </div>
        <button className="btn btn--ghost" onClick={onDone}>
          返回记账
        </button>
      </header>

      {!current ? (
        <section className="card">
          <div className="empty">
            <div className="empty__big">全部归类完成</div>
            <p className="muted">没有待补充用途的支出了。</p>
            <button className="btn btn--primary" onClick={onDone}>
              回到记账
            </button>
          </div>
        </section>
      ) : (
        <section className="card triage">
          <div className="triage__counter">
            还剩 {queue.length} 笔 · 按金额从大到小
          </div>

          <div className="triage__amount">¥{formatCents(current.amountCents)}</div>
          <div className="triage__meta">
            {formatDateLabel(current.date)}
            {current.note ? ` · ${current.note}` : ' · 无备注'}
          </div>

          <div className="triage__keys">
            {shortcuts.map((category, index) => (
              <button key={category.id} className="key" onClick={() => assign(current, category.id)}>
                <span className="key__num">{index + 1}</span>
                {category.name}
              </button>
            ))}
          </div>

          {expenseCategories.length > shortcuts.length && (
            <div className="triage__more">
              {expenseCategories.slice(shortcuts.length).map((category) => (
                <button key={category.id} className="chip" onClick={() => assign(current, category.id)}>
                  {category.name}
                </button>
              ))}
            </div>
          )}

          <div className="triage__actions">
            <button className="btn btn--ghost" onClick={skipCurrent}>
              还是想不起来（Esc）
            </button>
          </div>

          {flash && <div className="notice notice--info">{flash}</div>}
        </section>
      )}
    </div>
  )
}
