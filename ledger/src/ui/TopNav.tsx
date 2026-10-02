import type { ReactNode } from 'react'
import { IconChart, IconPen, IconSliders, IconSun } from './kit'

export type TabId = 'entry' | 'today' | 'month' | 'manage'

const TABS: ReadonlyArray<{ id: TabId; label: string; icon: ReactNode }> = [
  { id: 'entry', label: '记账', icon: <IconPen /> },
  { id: 'today', label: '今日', icon: <IconSun /> },
  { id: 'month', label: '本月', icon: <IconChart /> },
  { id: 'manage', label: '管理', icon: <IconSliders /> },
]

interface TopNavProps {
  page: TabId
  onChange: (page: TabId) => void
  /** 「本月」标签上的待补充角标 */
  pendingCount: number
}

/** 顶部导航：标题在左、四个入口横排在右上角 */
export function TopNav({ page, onChange, pendingCount }: TopNavProps) {
  return (
    <header className="topnav">
      <span className="topnav__brand">生活费记账本</span>
      <nav className="topnav__tabs" aria-label="主导航">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={page === tab.id ? 'topnav__item is-active' : 'topnav__item'}
            onClick={() => onChange(tab.id)}
            aria-current={page === tab.id ? 'page' : undefined}
          >
            <span className="topnav__icon">
              {tab.icon}
              {tab.id === 'month' && pendingCount > 0 && <span className="topnav__badge">{pendingCount}</span>}
            </span>
            <span className="topnav__label">{tab.label}</span>
          </button>
        ))}
      </nav>
    </header>
  )
}
