import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Category, Tx, TxDraft, TxKind } from './types'
import { currentMonth, formatCents, formatCentsGrouped, parseYuanToCents, shiftMonth, todayISO } from './lib/money'
import { all, exportBytes, get, initLedger, run } from './db/ledger-client'

const ALL = '__all__'

interface EditingState {
  id: number
  amount: string
  date: string
  kind: TxKind
  category: string
  note: string
}

/** 汇总（在数据库里用 SQL 聚合，不把全部明细拉到前端累加） */
interface SummaryRow {
  incomeCents: number
  expenseCents: number
  count: number
}

/**
 * 主界面。所有数据操作都通过 Worker 里的 SQLite 完成。
 * 关键状态区分：「初始化中」与「确实没有数据」必须分开，
 * 否则数据库打开期间会闪一个空账本，看起来像数据丢了。
 */
export default function App() {
  const [ledgerReady, setLedgerReady] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)
  const [storagePersisted, setStoragePersisted] = useState<boolean | null>(null)

  const [month, setMonth] = useState(() => currentMonth())
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL)
  const [categories, setCategories] = useState<Category[]>([])
  const [rows, setRows] = useState<Tx[] | null>(null)
  const [summary, setSummary] = useState<SummaryRow>({ incomeCents: 0, expenseCents: 0, count: 0 })
  const [reloadToken, setReloadToken] = useState(0)

  const [editing, setEditing] = useState<EditingState | null>(null)
  const [form, setForm] = useState(() => ({
    kind: 'expense' as TxKind,
    amount: '',
    date: todayISO(),
    category: '',
    note: '',
  }))
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(() => setReloadToken((n) => n + 1), [])

  // ---- 打开数据库 ----
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // 主动申请持久化，降低浏览器在存储紧张时清掉账本的可能
        if (navigator.storage?.persist) {
          const granted = await navigator.storage.persist()
          if (!cancelled) setStoragePersisted(granted)
        }
        await initLedger()
        if (cancelled) return
        setLedgerReady(true)
      } catch (err) {
        if (!cancelled) setInitError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // ---- 分类 ----
  useEffect(() => {
    if (!ledgerReady) return
    let cancelled = false
    all<Category>('SELECT name, kind, sort_order AS sortOrder FROM categories ORDER BY sort_order, name')
      .then((list) => {
        if (cancelled) return
        setCategories(list)
        setForm((f) => (f.category ? f : { ...f, category: list.find((c) => c.kind === f.kind)?.name ?? '' }))
      })
      .catch((err: unknown) => setInitError(err instanceof Error ? err.message : String(err)))
    return () => {
      cancelled = true
    }
  }, [ledgerReady])

  // ---- 明细与汇总（rows 为 null 表示尚未加载完成，界面显示「读取中」）----
  useEffect(() => {
    if (!ledgerReady) return
    let cancelled = false
    setRows(null)

    const sql = `
      SELECT id, date, kind, amount_cents AS amountCents, category, note
      FROM transactions
      WHERE date LIKE ?1 || '%'
        AND (?2 = '${ALL}' OR category = ?2)
      ORDER BY date DESC, id DESC
    `
    Promise.all([
      all<Tx>(sql, [month, categoryFilter]),
      get<SummaryRow>(
        `SELECT
           COALESCE(SUM(CASE WHEN kind = 'income'  THEN amount_cents END), 0) AS incomeCents,
           COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount_cents END), 0) AS expenseCents,
           COUNT(*) AS count
         FROM transactions WHERE date LIKE ?1 || '%'`,
        [month],
      ),
    ])
      .then(([list, sum]) => {
        if (cancelled) return
        setRows(list)
        setSummary(sum ?? { incomeCents: 0, expenseCents: 0, count: 0 })
      })
      .catch((err: unknown) => {
        if (!cancelled) setInitError(err instanceof Error ? err.message : String(err))
      })

    return () => {
      cancelled = true
    }
  }, [ledgerReady, month, categoryFilter, reloadToken])

  const categoriesForKind = useMemo(
    () => categories.filter((c) => c.kind === form.kind).map((c) => c.name),
    [categories, form.kind],
  )

  // 切换收入/支出后，若当前分类不属于该类型则自动改选
  useEffect(() => {
    if (categoriesForKind.length === 0) return
    if (!categoriesForKind.includes(form.category)) {
      setForm((f) => ({ ...f, category: categoriesForKind[0] ?? '' }))
    }
  }, [categoriesForKind, form.category])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!ledgerReady) return
    setFormError(null)

    const amountCents = parseYuanToCents(form.amount)
    if (amountCents === null || amountCents <= 0) {
      setFormError('金额请填写大于 0 的数字，最多两位小数')
      return
    }
    if (!form.category) {
      setFormError('请选择分类')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
      setFormError('日期格式应为 YYYY-MM-DD')
      return
    }

    const draft: TxDraft = {
      date: form.date,
      kind: form.kind,
      amountCents,
      category: form.category,
      note: form.note.trim(),
    }

    setBusy(true)
    try {
      await run(
        `INSERT INTO transactions (date, kind, amount_cents, category, note)
         VALUES (?1, ?2, ?3, ?4, ?5)`,
        [draft.date, draft.kind, draft.amountCents, draft.category, draft.note],
      )
      setForm((f) => ({ ...f, amount: '', note: '' }))
      // 记账后跳到该笔账目所属月份，否则用户会以为没记上
      setMonth(draft.date.slice(0, 7))
      reload()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveEdit() {
    if (!ledgerReady || !editing) return
    const amountCents = parseYuanToCents(editing.amount)
    if (amountCents === null || amountCents <= 0) {
      setFormError('金额请填写大于 0 的数字，最多两位小数')
      return
    }
    setBusy(true)
    try {
      await run(
        `UPDATE transactions
         SET date = ?1, kind = ?2, amount_cents = ?3, category = ?4, note = ?5
         WHERE id = ?6`,
        [editing.date, editing.kind, amountCents, editing.category, editing.note.trim(), editing.id],
      )
      setEditing(null)
      setFormError(null)
      reload()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(tx: Tx) {
    if (!ledgerReady) return
    const label = `${tx.date} ${tx.category} ${formatCents(tx.amountCents)} 元`
    if (!window.confirm(`确定删除这条账目吗？\n\n${label}`)) return
    setBusy(true)
    try {
      await run('DELETE FROM transactions WHERE id = ?1', [tx.id])
      reload()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  /** 把数据库导出成 .sqlite 文件下载到本地 */
  async function handleExport() {
    if (!ledgerReady) return
    setBusy(true)
    setFormError(null)
    try {
      const bytes: Uint8Array<ArrayBuffer> = await exportBytes()
      const blob = new Blob([bytes], { type: 'application/vnd.sqlite3' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `ledger-${todayISO()}.sqlite`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (initError) {
    const poolBusy = /lock|Lock|already|Another/i.test(initError)
    return (
      <div className="app">
        <h1 className="app__title">记账本</h1>
        <div className="notice notice--error">
          <strong>数据库打开失败。</strong>
          <div style={{ marginTop: 6 }}>{initError}</div>
          {poolBusy && (
            <div style={{ marginTop: 6 }}>
              这个账本同一时间只允许一个标签页打开。请检查是否已在别的标签页中打开，关掉多余的标签页后刷新本页。
            </div>
          )}
        </div>
      </div>
    )
  }

  if (!ledgerReady) {
    return (
      <div className="app">
        <h1 className="app__title">记账本</h1>
        <div className="notice notice--info">正在打开本地数据库…</div>
      </div>
    )
  }

  const balance = summary.incomeCents - summary.expenseCents
  const ready = rows !== null

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1 className="app__title">记账本</h1>
          <p className="app__subtitle">数据保存在本机浏览器的 SQLite 文件中，不上传任何服务器</p>
        </div>
      </header>

      {storagePersisted === false && (
        <div className="notice notice--info">
          浏览器未授予「持久化存储」权限。账本仍会保存，但在磁盘空间紧张时可能被浏览器回收。建议定期用下方「导出备份」留一份
          <code>.sqlite</code> 文件。
        </div>
      )}

      {/* ---- 新增 ---- */}
      <section className="card">
        <h2 className="card__title">记一笔</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label className="field">
              <span className="field__label">类型</span>
              <select
                value={form.kind}
                onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as TxKind }))}
              >
                <option value="expense">支出</option>
                <option value="income">收入</option>
              </select>
            </label>

            <label className="field">
              <span className="field__label">金额（元）</span>
              <input
                className="amount"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </label>

            <label className="field">
              <span className="field__label">日期</span>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </label>

            <label className="field">
              <span className="field__label">分类</span>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              >
                {categoriesForKind.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field field--wide">
              <span className="field__label">备注（可选）</span>
              <input
                type="text"
                placeholder="例如：午饭"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              />
            </label>

            <button className="button" type="submit" disabled={busy}>
              保存
            </button>
          </div>
          {formError && !editing && (
            <div className="notice notice--error" style={{ marginTop: 12, marginBottom: 0 }}>
              {formError}
            </div>
          )}
        </form>
      </section>

      {/* ---- 月份与汇总 ---- */}
      <section className="card">
        <div className="toolbar" style={{ marginBottom: 14 }}>
          <button className="icon-button" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
            ← 上月
          </button>
          <span className="toolbar__month">{month}</span>
          <button className="icon-button" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
            下月 →
          </button>
          <button className="icon-button" onClick={() => setMonth(currentMonth())}>
            回到本月
          </button>

          <span className="toolbar__spacer" />

          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value={ALL}>全部分类</option>
            {categories.map((c) => (
              <option key={`${c.kind}-${c.name}`} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="summary">
          <div className="summary__item">
            <div className="summary__label">收入</div>
            <div className="summary__value summary__value--income">
              {formatCentsGrouped(summary.incomeCents)}
            </div>
          </div>
          <div className="summary__item">
            <div className="summary__label">支出</div>
            <div className="summary__value summary__value--expense">
              {formatCentsGrouped(summary.expenseCents)}
            </div>
          </div>
          <div className="summary__item">
            <div className="summary__label">结余</div>
            <div className="summary__value">{formatCentsGrouped(balance)}</div>
          </div>
          <div className="summary__item">
            <div className="summary__label">笔数</div>
            <div className="summary__value">{summary.count}</div>
          </div>
        </div>
      </section>

      {/* ---- 明细 ---- */}
      <section className="card">
        <h2 className="card__title">明细</h2>

        {editing && (
          <div className="notice notice--info" style={{ display: 'grid', gap: 10 }}>
            <strong>编辑账目 #{editing.id}</strong>
            <div className="form-grid">
              <label className="field">
                <span className="field__label">类型</span>
                <select
                  value={editing.kind}
                  onChange={(e) => setEditing({ ...editing, kind: e.target.value as TxKind })}
                >
                  <option value="expense">支出</option>
                  <option value="income">收入</option>
                </select>
              </label>
              <label className="field">
                <span className="field__label">金额（元）</span>
                <input
                  className="amount"
                  type="text"
                  inputMode="decimal"
                  value={editing.amount}
                  onChange={(e) => setEditing({ ...editing, amount: e.target.value })}
                />
              </label>
              <label className="field">
                <span className="field__label">日期</span>
                <input
                  type="date"
                  value={editing.date}
                  onChange={(e) => setEditing({ ...editing, date: e.target.value })}
                />
              </label>
              <label className="field">
                <span className="field__label">分类</span>
                <select
                  value={editing.category}
                  onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                >
                  {categories
                    .filter((c) => c.kind === editing.kind)
                    .map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field field--wide">
                <span className="field__label">备注</span>
                <input
                  type="text"
                  value={editing.note}
                  onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                />
              </label>
            </div>
            {formError && <div className="notice notice--error" style={{ margin: 0 }}>{formError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="button" onClick={handleSaveEdit} disabled={busy}>
                保存修改
              </button>
              <button
                className="button button--ghost"
                onClick={() => {
                  setEditing(null)
                  setFormError(null)
                }}
              >
                取消
              </button>
            </div>
          </div>
        )}

        {!ready ? (
          <div className="empty">正在读取…</div>
        ) : rows.length === 0 ? (
          <div className="empty">
            {month} 没有账目记录
            {categoryFilter !== ALL && '（已按分类筛选）'}
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 108 }}>日期</th>
                <th style={{ width: 92 }}>分类</th>
                <th>备注</th>
                <th className="num" style={{ width: 120 }}>
                  金额
                </th>
                <th style={{ width: 116 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((tx) => (
                <tr key={tx.id}>
                  <td className="muted">{tx.date.slice(5)}</td>
                  <td>{tx.category}</td>
                  <td className="muted">{tx.note || '—'}</td>
                  <td className={`num num--${tx.kind}`}>
                    {tx.kind === 'income' ? '+' : '-'}
                    {formatCents(tx.amountCents)}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="icon-button"
                        onClick={() => {
                          setFormError(null)
                          setEditing({
                            id: tx.id,
                            amount: formatCents(tx.amountCents),
                            date: tx.date,
                            kind: tx.kind,
                            category: tx.category,
                            note: tx.note,
                          })
                        }}
                      >
                        编辑
                      </button>
                      <button className="icon-button icon-button--danger" onClick={() => void handleDelete(tx)}>
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2 className="card__title">备份</h2>
        <div className="toolbar">
          <button className="button button--ghost" onClick={() => void handleExport()} disabled={busy}>
            导出备份（.sqlite）
          </button>
          <span className="muted" style={{ fontSize: 12 }}>
            导出的文件可直接用 DB Browser for SQLite 等工具打开查看
          </span>
        </div>
      </section>

      <p className="footnote">
        数据库存放在浏览器 OPFS（源私有文件系统）中的 <code>ledger.sqlite3</code>，数据不会离开本机。
        注意 OPFS 按「协议 + 主机 + 端口」隔离，端口变了就是另一个空数据库，所以请固定用
        <code>http://localhost:5173</code> 打开。同一时间只允许一个标签页打开本账本。
      </p>
    </div>
  )
}
