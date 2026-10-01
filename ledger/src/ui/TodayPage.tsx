import { useMemo, useState } from 'react'
import type { LedgerRow } from '../core/types'
import { dayNet, rowsOfDay } from '../core/stats'
import { formatCents, formatDateLabel, relativeDayLabel, shiftDay } from '../core/money'
import { categoryById, useLedger } from '../core/store'
import { IconChevronLeft, IconChevronRight, Money } from './kit'
import { TxRow } from './EntryPage'

interface TodayPageProps {
  onEdit: (row: LedgerRow) => void
}

/**
 * 今日页：今日支出 + 当日账单。
 * 任意一天的账单都在这里，每一笔都能点开修改。
 */
export function TodayPage({ onEdit }: TodayPageProps) {
  const { referenceDate, categories, rows } = useLedger()
  const [day, setDay] = useState(referenceDate)

  const dayRows = useMemo(
    () => rowsOfDay(rows, day).sort((a, b) => b.id - a.id),
    [rows, day],
  )
  const net = dayNet(rows, day)
  const incomeOfDay = dayRows
    .filter((row) => row.kind === 'income')
    .reduce((sum, row) => sum + row.amountCents, 0)

  const isToday = day === referenceDate
  const canGoNext = day < referenceDate

  return (
    <div className="page">
      <div className="page__heading">
        <h1 className="page__title">{isToday ? '今天' : formatDateLabel(day)}</h1>
        <p className="page__subtitle">
          {isToday ? relativeDayLabel(day, referenceDate) : `距今天 ${formatDateLabel(day)}`}
        </p>
      </div>

      <div className="day-nav">
        <button className="round-btn" onClick={() => setDay((value) => shiftDay(value, -1))} aria-label="前一天">
          <IconChevronLeft />
        </button>
        <div className="day-nav__center">
          <span className="day-nav__label">{formatDateLabel(day)}</span>
          <div className="day-nav__shortcuts">
            <button className={isToday ? 'mini is-active' : 'mini'} onClick={() => setDay(referenceDate)}>
              今天
            </button>
            <button className={day === shiftDay(referenceDate, -1) ? 'mini is-active' : 'mini'} onClick={() => setDay(shiftDay(referenceDate, -1))}>
              昨天
            </button>
            <button className={day === shiftDay(referenceDate, -2) ? 'mini is-active' : 'mini'} onClick={() => setDay(shiftDay(referenceDate, -2))}>
              前天
            </button>
          </div>
        </div>
        <button
          className="round-btn"
          disabled={!canGoNext}
          onClick={() => canGoNext && setDay((value) => shiftDay(value, 1))}
          aria-label="后一天"
        >
          <IconChevronRight />
        </button>
      </div>

      <section className="card hero">
        <div className="hero__label">当日支出</div>
        <div className="hero__value">
          <Money cents={net} />
        </div>
        {incomeOfDay > 0 && (
          <div className="hero__aside">当日收入 ¥{formatCents(incomeOfDay)}</div>
        )}
      </section>

      <section className="card">
        <div className="card__title">
          当日账单
          <span className="card__hint">{dayRows.length} 笔</span>
        </div>
        {dayRows.length === 0 ? (
          <div className="empty">
            {isToday ? '今天还没记账' : '这一天没有记录'}
            <div className="empty__hint">去「记账」页补一笔吧</div>
          </div>
        ) : (
          <ul className="tx-list">
            {dayRows.map((row) => (
              <TxRow
                key={row.id}
                row={row}
                categoryName={categoryById(categories, row.categoryId)?.name ?? '未知'}
                onEdit={onEdit}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
