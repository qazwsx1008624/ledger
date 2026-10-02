import { useMemo, useState } from 'react'
import type { LedgerRow } from '../core/types'
import { categoryBreakdown, monthTotals, pendingRows, rowsOfMonth } from '../core/stats'
import { formatCents, monthOf, shiftMonth } from '../core/money'
import { categoryById, useLedger } from '../core/store'
import { IconArrowLeft, IconChevronLeft, IconChevronRight, Money } from './kit'
import { TxRow } from './EntryPage'

interface MonthPageProps {
  onEdit: (row: LedgerRow) => void
  onOpenTriage: () => void
}

/**
 * 本月页：本月支出 + 分类占比。
 * 点分类下钻看该分类的本月明细；「用途待补充」入口也在这里。
 */
export function MonthPage({ onEdit, onOpenTriage }: MonthPageProps) {
  const { referenceDate, categories, rows, budgetCents } = useLedger()
  const [month, setMonth] = useState(() => monthOf(referenceDate))
  const [detailCategory, setDetailCategory] = useState<number | null>(null)
  const [showAllTx, setShowAllTx] = useState(false)

  const totals = monthTotals(rows, month)
  const lines = categoryBreakdown(rows, month)
  const pending = useMemo(() => pendingRows(rows), [rows])

  /** 整月账单，默认收起；按金额从高到低（同金额时按录入先后） */
  const monthRows = useMemo(
    () =>
      rowsOfMonth(rows, month).sort((a, b) => {
        if (a.amountCents !== b.amountCents) return b.amountCents - a.amountCents
        return a.id - b.id
      }),
    [rows, month],
  )

  const detailRows = useMemo(() => {
    if (detailCategory === null) return []
    return rowsOfMonth(rows, month)
      .filter((row) => row.categoryId === detailCategory)
      .sort((a, b) => b.id - a.id)
  }, [rows, month, detailCategory])

  if (detailCategory !== null) {
    const category = categoryById(categories, detailCategory)
    return (
      <div className="page">
        <div className="detail-head">
          <button className="round-btn" onClick={() => setDetailCategory(null)} aria-label="返回">
            <IconArrowLeft />
          </button>
          <div>
            <div className="page__title">{category?.name ?? '未知分类'}</div>
            <p className="page__subtitle">{month} · 点任意一笔可修改</p>
          </div>
        </div>

        {detailRows.length === 0 ? (
          <div className="empty">这个分类在 {month} 没有账目</div>
        ) : (
          <ul className="tx-list">
            {detailRows.map((row) => (
              <TxRow
                key={row.id}
                row={row}
                categoryName={category?.name ?? '未知'}
                onEdit={onEdit}
              />
            ))}
          </ul>
        )}
      </div>
    )
  }

  const budgetLeft = budgetCents === null ? null : budgetCents - totals.netExpenseCents
  const maxNet = lines.reduce((max, line) => Math.max(max, line.netCents), 0)

  return (
    <div className="page">
      <div className="page__heading">
        <h1 className="page__title">本月花费</h1>
        <p className="page__subtitle">{month}</p>
      </div>

      <div className="month-nav">
        <button className="round-btn" onClick={() => setMonth((value) => shiftMonth(value, -1))} aria-label="上月">
          <IconChevronLeft />
        </button>
        <span className="month-nav__label">{month}</span>
        <button className="round-btn" onClick={() => setMonth((value) => shiftMonth(value, 1))} aria-label="下月">
          <IconChevronRight />
        </button>
        {month !== monthOf(referenceDate) && (
          <button className="mini" onClick={() => setMonth(monthOf(referenceDate))}>
            回到本月
          </button>
        )}
      </div>

      <section className="card hero">
        <div className="hero__label">本月支出</div>
        <div className="hero__value">
          <Money cents={totals.netExpenseCents} />
        </div>
        <div className="hero__aside">
          收入 ¥{formatCents(totals.incomeCents)} · 退款 ¥{formatCents(totals.refundCents)} · 可存下 ¥
          {formatCents(totals.savedCents)}
        </div>
        {budgetLeft !== null && (
          <div className={budgetLeft < 0 ? 'budget-line is-over' : 'budget-line'}>
            {budgetLeft < 0 ? `超出预期 ¥${formatCents(-budgetLeft)}` : `剩余 ¥${formatCents(budgetLeft)}`}
            <span className="budget-line__hint">预期 ¥{formatCents(budgetCents ?? 0)}</span>
          </div>
        )}
      </section>

      {pending.length > 0 && (
        <button type="button" className="triage-banner" onClick={onOpenTriage}>
          <span className="triage-banner__icon">✍️</span>
          <span className="triage-banner__text">
            <strong>{pending.length} 笔用途待补充</strong>
            <span className="triage-banner__hint">按数字键快速归类，一分钟搞定</span>
          </span>
          <span className="triage-banner__go">去处理 →</span>
        </button>
      )}

      <section className="card">
        <div className="card__title">
          分类占比
          <span className="card__hint">已扣退款 · 点分类看明细</span>
        </div>
        {lines.length === 0 ? (
          <div className="empty">{month} 没有支出记录</div>
        ) : (
          <ul className="cat-list">
            {lines.map((line) => {
              const category = categoryById(categories, line.categoryId)
              return (
                <li key={line.categoryId}>
                  <button type="button" className="cat-row" onClick={() => setDetailCategory(line.categoryId)}>
                    <span className="cat-row__dot" style={{ background: dotColor(category?.id ?? 0) }} />
                    <span className="cat-row__main">
                      <span className="cat-row__name">
                        {category?.name ?? '未知分类'}
                        {line.refundCents > 0 && <span className="cat-row__refund">含退款 ¥{formatCents(line.refundCents)}</span>}
                      </span>
                      <span className="cat-row__bar">
                        <span
                          className="cat-row__fill"
                          style={{ width: maxNet > 0 ? `${(line.netCents / maxNet) * 100}%` : '0%' }}
                        />
                      </span>
                    </span>
                    <span className="cat-row__side">
                      <span className="cat-row__amount">
                        <Money cents={line.netCents} symbol={false} />
                      </span>
                      <span className="cat-row__share">{Math.round(line.share * 100)}%</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="card">
        <button
          type="button"
          className="collapsible-head"
          onClick={() => setShowAllTx((value) => !value)}
          aria-expanded={showAllTx}
        >
          <span>
            本月账单
            <span className="card__hint"> {monthRows.length} 笔 · 按金额从高到低</span>
          </span>
          <span className={showAllTx ? 'collapsible-caret is-open' : 'collapsible-caret'}>▸</span>
        </button>

        {showAllTx &&
          (monthRows.length === 0 ? (
            <div className="empty">{month} 还没有账目</div>
          ) : (
            <ul className="tx-list">
              {monthRows.map((row) => (
                <TxRow
                  key={row.id}
                  row={row}
                  categoryName={categoryById(categories, row.categoryId)?.name ?? '未知'}
                  onEdit={onEdit}
                />
              ))}
            </ul>
          ))}
      </section>
    </div>
  )
}

/** 给分类一个稳定柔和的颜色点 */
const DOT_COLORS = ['#6A9B7F', '#D9A441', '#E07A5F', '#7A9BC2', '#B08BBE', '#C2A878', '#5FA8A0', '#C96F6F', '#8B93A8']

function dotColor(id: number): string {
  return DOT_COLORS[id % DOT_COLORS.length] ?? '#8B93A8'
}
