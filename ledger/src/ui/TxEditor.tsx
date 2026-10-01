import { useEffect, useState } from 'react'
import type { LedgerRow, TxKind } from '../core/types'
import { formatCents, formatDateLabel, parseYuanToCents } from '../core/money'
import { categoriesOfKind, updateRow, useLedger } from '../core/store'
import { Segmented } from './kit'

interface TxEditorProps {
  row: LedgerRow
  onClose: () => void
  onDelete: (row: LedgerRow) => void
}

/**
 * 底部滑出的账目编辑面板。任何一笔账目（任意日期、任意分类下）点开都是它，
 * 所以「只有最近三笔能改」的问题从入口上就消除了。
 */
export function TxEditor({ row, onClose, onDelete }: TxEditorProps) {
  const { categories } = useLedger()
  const [kind, setKind] = useState<TxKind>(row.kind)
  const [amount, setAmount] = useState(formatCents(row.amountCents))
  const [date, setDate] = useState(row.date)
  const [categoryId, setCategoryId] = useState(row.categoryId)
  const [pendingCategory, setPendingCategory] = useState(row.pendingCategory === true)
  const [isRefund, setIsRefund] = useState(row.isRefund === true)
  const [note, setNote] = useState(row.note)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const options = categoriesOfKind(categories, kind)

  // 打开时锁定背景滚动
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  function save() {
    const cents = parseYuanToCents(amount)
    if (cents === null) {
      setError('金额请填写大于 0 的数字，最多两位小数')
      return
    }
    if (!pendingCategory && !options.some((option) => option.id === categoryId)) {
      setError('请选择分类')
      return
    }
    setError(null)
    updateRow(row.id, {
      kind,
      date,
      amountCents: cents,
      categoryId,
      note: note.trim(),
      isRefund: kind === 'expense' && isRefund ? true : false,
      pendingCategory: kind === 'expense' && pendingCategory ? true : false,
    })
    onClose()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sheet__grabber" />
        <div className="sheet__header">
          <div>
            <div className="sheet__title">编辑账目</div>
            <div className="sheet__meta">#{row.id} · {formatDateLabel(row.date)}</div>
          </div>
          <button className="sheet__close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>

        <div className="sheet__body">
          <div className="field-row">
            <Segmented
              options={[
                { value: 'expense', label: '支出' },
                { value: 'income', label: '收入' },
              ]}
              value={kind}
              onChange={setKind}
            />
          </div>

          <div className="field-row field-row--amount">
            <span className="field-symbol">¥</span>
            <input
              className="field-amount"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
            />
          </div>

          <div className="field-row field-row--date">
            <span className="field-label">日期</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>

          <div className="field-row field-row--chips">
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

          <div className="field-row">
            <span className="field-label">备注</span>
            <input
              className="field-note"
              type="text"
              placeholder="哪怕写两个字，事后才想得起来"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          {error && <div className="notice notice--error">{error}</div>}
        </div>

        <div className="sheet__footer">
          <button className="btn btn--primary" onClick={save}>
            保存修改
          </button>
          {confirmingDelete ? (
            <button className="btn btn--danger-solid" onClick={() => onDelete(row)}>
              再点一次确认删除
            </button>
          ) : (
            <button className="btn btn--ghost" onClick={() => setConfirmingDelete(true)}>
              删除
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
