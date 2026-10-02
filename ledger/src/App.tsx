import { useEffect, useState } from 'react'
import type { LedgerRow } from './core/types'
import { formatCents, formatDateLabel } from './core/money'
import { categoryById, initLedger, removeRow, restoreRow, useLedger } from './core/store'
import { EntryPage } from './ui/EntryPage'
import { ManagePage } from './ui/ManagePage'
import { MonthPage } from './ui/MonthPage'
import { TodayPage } from './ui/TodayPage'
import { TopNav, type TabId } from './ui/TopNav'
import { TriagePage } from './ui/TriagePage'
import { TxEditor } from './ui/TxEditor'

/**
 * 应用壳：顶部导航 + 四个页面 + 全屏归类 + 编辑面板 + 撤销提示。
 */
export default function App() {
  const { status, errorMessage, categories, dataLossWarning } = useLedger()
  const [page, setPage] = useState<TabId>('entry')
  const [triageOpen, setTriageOpen] = useState(false)
  const [editing, setEditing] = useState<LedgerRow | null>(null)
  const [undo, setUndo] = useState<{ id: number; label: string } | null>(null)

  // 打开应用即初始化数据库
  useEffect(() => {
    void initLedger()
  }, [])

  function handleDelete(row: LedgerRow) {
    const category = categoryById(categories, row.categoryId)?.name ?? '未知分类'
    void removeRow(row.id).then(() => {
      setUndo({ id: row.id, label: `${formatDateLabel(row.date)} ${category} ¥${formatCents(row.amountCents)}` })
    })
    setEditing(null)
  }

  // 撤销提示条 6 秒后自动消失；账目本身仍在回收站
  useEffect(() => {
    if (!undo) return
    const timer = setTimeout(() => setUndo(null), 6000)
    return () => clearTimeout(timer)
  }, [undo])

  if (status === 'loading') {
    return (
      <div className="app-shell">
        <main className="main">
          <div className="boot">
            <div className="boot__emoji">🗂️</div>
            <div className="boot__title">正在打开本地账本…</div>
            <p className="boot__hint">数据存在这台电脑的浏览器里，不上传任何服务器</p>
          </div>
        </main>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="app-shell">
        <main className="main">
          <div className="boot">
            <div className="boot__emoji">⚠️</div>
            <div className="boot__title">打开账本失败</div>
            <p className="boot__hint">{errorMessage}</p>
            <p className="boot__hint">
              如果提示与「连接」有关：本账本同一时间只允许一个标签页打开，请关掉其他标签页后重试。
            </p>
            <button className="btn btn--primary" onClick={() => void initLedger()}>
              重试
            </button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <TopNav page={page} onChange={setPage} />

      {dataLossWarning && (
        <div className="dataloss-banner">
          <span>
            ⚠️ 检测到本地账本为空，但历史上曾有备份记录。如果这不是你主动清空的，请到「管理 → 数据」导入备份恢复。
          </span>
        </div>
      )}

      <main className="main">
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
      </main>

      {editing && <TxEditor key={editing.id} row={editing} onClose={() => setEditing(null)} onDelete={handleDelete} />}

      {undo && (
        <div className="snackbar" role="status">
          <span>已删除 {undo.label}</span>
          <button
            className="btn btn--onDark"
            onClick={() => {
              void restoreRow(undo.id)
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
