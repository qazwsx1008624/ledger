import { useEffect, useMemo, useState } from 'react'
import type { LedgerRow } from './core/types'
import { formatCents, formatDateLabel } from './core/money'
import { pendingRows } from './core/stats'
import { categoryById, removeRow, restoreRow, useLedger } from './core/store'
import { EntryPage } from './ui/EntryPage'
import { ManagePage } from './ui/ManagePage'
import { MonthPage } from './ui/MonthPage'
import { TabBar, type TabId } from './ui/TabBar'
import { TodayPage } from './ui/TodayPage'
import { TriagePage } from './ui/TriagePage'
import { TxEditor } from './ui/TxEditor'

/**
 * 应用壳：底部导航 + 四个页面 + 全屏归类 + 编辑面板 + 撤销提示。
 */
export default function App() {
  const { categories, rows } = useLedger()
  const [page, setPage] = useState<TabId>('entry')
  const [triageOpen, setTriageOpen] = useState(false)
  const [editing, setEditing] = useState<LedgerRow | null>(null)
  const [undo, setUndo] = useState<{ id: number; label: string } | null>(null)

  const pending = useMemo(() => pendingRows(rows), [rows])

  function handleDelete(row: LedgerRow) {
    const category = categoryById(categories, row.categoryId)?.name ?? '未知分类'
    removeRow(row.id)
    setEditing(null)
    setUndo({ id: row.id, label: `${formatDateLabel(row.date)} ${category} ¥${formatCents(row.amountCents)}` })
  }

  // 撤销提示条 6 秒后自动消失；账目本身仍在回收站
  useEffect(() => {
    if (!undo) return
    const timer = setTimeout(() => setUndo(null), 6000)
    return () => clearTimeout(timer)
  }, [undo])

  return (
    <div className="app">
      {triageOpen ? (
        <TriagePage onClose={() => setTriageOpen(false)} />
      ) : (
        <>
          {page === 'entry' && <EntryPage onEdit={setEditing} />}
          {page === 'today' && <TodayPage onEdit={setEditing} />}
          {page === 'month' && <MonthPage onEdit={setEditing} onOpenTriage={() => setTriageOpen(true)} />}
          {page === 'manage' && <ManagePage />}
        </>
      )}

      {!triageOpen && <TabBar page={page} onChange={setPage} pendingCount={pending.length} />}

      {editing && <TxEditor key={editing.id} row={editing} onClose={() => setEditing(null)} onDelete={handleDelete} />}

      {undo && (
        <div className="snackbar" role="status">
          <span>已删除 {undo.label}</span>
          <button
            className="btn btn--onDark"
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
