import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { LedgerRow, TxKind } from '../core/types'
import { formatCents, formatDateLabel, parseYuanToCents, relativeDayLabel, shiftDay } from '../core/money'
import { addRow, categoriesOfKind, categoryById, useLedger } from '../core/store'
import { Segmented } from './kit'

interface EntryPageProps {
  onEdit: (row: LedgerRow) => void
}

/**
 * 记账页：录入 + 最近几笔。
 * 记错了通常在刚记完的几秒内，所以最近几笔直接跟在录入区下面，点开即可改。
 */
export function EntryPage({ onEdit }: EntryPageProps) {
  const { referenceDate, categories, rows } = useLedger()

  const [kind, setKind] = useState<TxKind>('expense')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(referenceDate)
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [pendingCategory, setPendingCategory] = useState(false)
  const [isRefund, setIsRefund] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const amountRef = useRef<HTMLInputElement>(null)
  const options = useMemo(() => categoriesOfKind(categories, kind), [categories, kind])

  // 打开页面即聚焦金额框
  useEffect(() => {
    amountRef.current?.focus()
  }, [])

  // 切换类型后，若选中分类不属于该类型则改选第一个
  useEffect(() => {
    if (options.length === 0) return
    if (categoryId === null || !options.some((option) => option.id === categoryId)) {
      setCategoryId(options[0]?.id ?? null)
    }
  }, [options, categoryId])

  // 收入没有退款与待补充
  useEffect(() => {
    if (kind === 'income') {
      setIsRefund(false)
      setPendingCategory(false)
    }
  }, [kind])

  const recent = useMemo(
    () => rows.filter((row) => row.deletedAt === undefined).sort((a, b) => b.id - a.id).slice(0, 5),
    [rows],
  )

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
        isRefund: kind === 'expense' && isRefund ? true : false,
        pendingCategory: kind === 'expense' && pendingCategory ? true : false,
      })
      setAmount('')
      setNote('')
      setSaved(`${relativeDayLabel(date, referenceDate)}（${date.slice(5)}）`)
      amountRef.current?.focus()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <div className="page__heading">
        <h1 className="page__title">今天花了什么？</h1>
        <p className="page__subtitle">{formatDateLabel(referenceDate)}</p>
      </div>

      <section className="card card--entry">
        <form onSubmit={submit}>
          <Segmented
            options={[
              { value: 'expense', label: '支出' },
              { value: 'income', label: '收入' },
            ]}
            value={kind}
            onChange={setKind}
          />

          <div className="entry-amount">
            <span className="entry-amount__symbol">¥</span>
            <input
              ref={amountRef}
              className="entry-amount__field"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>

          <div className="entry-date">
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            <button type="button" className={date === referenceDate ? 'mini is-active' : 'mini'} onClick={() => setDate(referenceDate)}>
              今天
            </button>
            <button type="button" className={date === shiftDay(referenceDate, -1) ? 'mini is-active' : 'mini'} onClick={() => setDate(shiftDay(referenceDate, -1))}>
              昨天
            </button>
            <button type="button" className={date === shiftDay(referenceDate, -2) ? 'mini is-active' : 'mini'} onClick={() => setDate(shiftDay(referenceDate, -2))}>
              前天
            </button>
          </div>

          <div className="entry-chips">
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
              <button
                type="button"
                className={pendingCategory ? 'chip chip--pending is-active' : 'chip chip--pending'}
                onClick={() => setPendingCategory(true)}
              >
                用途待补充
              </button>
            )}
          </div>

          {kind === 'expense' && (
            <label className="check">
              <input type="checkbox" checked={isRefund} onChange={(event) => setIsRefund(event.target.checked)} />
              这是退款（会从支出里抵扣）
            </label>
          )}

          <div className="entry-note-row">
            <input
              className="entry-note"
              type="text"
              placeholder="备注（哪怕写两个字，事后才想得起来）"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <button className="btn btn--primary entry-save" type="submit" disabled={saving}>
              保存
            </button>
          </div>
        </form>

        {error && <div className="notice notice--error">{error}</div>}
        {saved && !error && <div className="notice notice--ok">已记在 {saved}，金额敲完回车还能继续记</div>}
      </section>

      <section className="card">
        <div className="card__title">
          最近几笔
          <span className="card__hint">点开即可修改或删除</span>
        </div>
        {recent.length === 0 ? (
          <div className="empty">还没有记录，先记一笔吧</div>
        ) : (
          <ul className="tx-list">
            {recent.map((row) => (
              <TxRow key={row.id} row={row} categoryName={categoryById(categories, row.categoryId)?.name ?? '未知'} onEdit={onEdit} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/** 账单行：点击整行打开编辑面板 */
export function TxRow({
  row,
  categoryName,
  onEdit,
}: {
  row: LedgerRow
  categoryName: string
  onEdit: (row: LedgerRow) => void
}) {
  const isIncome = row.kind === 'income'
  const amount = row.amountCents

  return (
    <li>
      <button type="button" className={isIncome ? 'tx-row is-income' : 'tx-row'} onClick={() => onEdit(row)}>
        <span className="tx-row__icon">{isIncome ? '↧' : row.isRefund ? '↩' : '↥'}</span>
        <span className="tx-row__main">
          <span className="tx-row__category">
            {row.pendingCategory === true ? '用途待补充' : categoryName}
            {row.note && <span className="tx-row__note">{row.note}</span>}
          </span>
          <span className="tx-row__date">{formatDateLabel(row.date)}</span>
        </span>
        <span className={isIncome ? 'tx-row__amount is-income' : 'tx-row__amount'}>
          {isIncome ? '+' : row.isRefund ? '退 ' : '−'}¥{formatCents(amount)}
        </span>
      </button>
    </li>
  )
}
