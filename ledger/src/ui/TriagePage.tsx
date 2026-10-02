import { useEffect, useMemo, useState } from 'react'
import type { LedgerRow } from '../core/types'
import { formatCents, formatDateLabel } from '../core/money'
import { pendingRows } from '../core/stats'
import { categoriesOfKind, updateRow, useLedger } from '../core/store'
import { IconArrowLeft } from './kit'

interface TriagePageProps {
  onClose: () => void
}

/**
 * 用途待补充 · 逐笔归类。
 * 按金额从大到小；数字键 1-9 归类，Esc / 空格跳过（移到队尾）。
 * 必须有「想不起来」的出口，否则用户会被逼着瞎选分类——那比留空更糟。
 */
export function TriagePage({ onClose }: TriagePageProps) {
  const { categories, rows } = useLedger()
  const [skipped, setSkipped] = useState<ReadonlySet<number>>(() => new Set())
  const [flash, setFlash] = useState<string | null>(null)

  const queue = useMemo(() => {
    const list = pendingRows(rows)
    return [...list.filter((row) => !skipped.has(row.id)), ...list.filter((row) => skipped.has(row.id))]
  }, [rows, skipped])

  const expenseCategories = useMemo(() => categoriesOfKind(categories, 'expense'), [categories])
  const shortcuts = expenseCategories.slice(0, 9)

  const current = queue[0]

  function skipCurrent() {
    if (!current) return
    setSkipped((previous) => new Set(previous).add(current.id))
    setFlash('已跳过，稍后再出现。想不起来就先放着，别随便选一个')
  }

  function assign(row: LedgerRow, categoryId: number) {
    // updateRow 写全量字段；归类 = 改分类并清除待补充标记
    void updateRow(row.id, {
      date: row.date,
      kind: row.kind,
      amountCents: row.amountCents,
      categoryId,
      note: row.note,
      isRefund: row.isRefund === true ? true : false,
      pendingCategory: false,
    })
  }

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
      assign(current, target.id)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  return (
    <div className="page triage-page">
      <div className="detail-head">
        <button className="round-btn" onClick={onClose} aria-label="返回">
          <IconArrowLeft />
        </button>
        <div>
          <div className="page__title">用途待补充</div>
          <p className="page__subtitle">按数字键归类 · 一笔一次按键</p>
        </div>
      </div>

      {!current ? (
        <section className="card">
          <div className="empty">
            <div className="empty__emoji">🎉</div>
            <div className="empty__big">全部归类完成</div>
            <p className="muted">没有待补充用途的支出了。</p>
            <button className="btn btn--primary" onClick={onClose}>
              回到本月
            </button>
          </div>
        </section>
      ) : (
        <section className="card triage">
          <div className="triage__counter">还剩 {queue.length} 笔 · 按金额从大到小</div>

          <div className="triage__amount">
            ¥{formatCents(current.amountCents)}
          </div>
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
