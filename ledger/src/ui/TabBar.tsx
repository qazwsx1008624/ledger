import type { ReactNode } from 'react'
import { IconChart, IconPen, IconSliders, IconSun } from './kit'

export type TabId = 'entry' | 'today' | 'month' | 'manage'

const TABS: ReadonlyArray<{ id: TabId; label: string; icon: ReactNode }> = [
  { id: 'entry', label: '记账', icon: <IconPen /> },
  { id: 'today', label: '今日', icon: <IconSun /> },
  { id: 'month', label: '本月', icon: <IconChart /> },
  { id: 'manage', label: '管理', icon: <IconSliders /> },
]

interface TabBarProps {
  page: TabId
  onChange: (page: TabId) => void
  /** 「本月」标签上的待补充角标 */
  pendingCount: number
}

export function TabBar({ page, onChange, pendingCount }: TabBarProps) {
  return (
    <nav className="tabbar" aria-label="主导航">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={page === tab.id ? 'tabbar__item is-active' : 'tabbar__item'}
          onClick={() => onChange(tab.id)}
          aria-current={page === tab.id ? 'page' : undefined}
        >
          <span className="tabbar__icon">
            {tab.icon}
            {tab.id === 'month' && pendingCount > 0 && <span className="tabbar__badge">{pendingCount}</span>}
          </span>
          <span className="tabbar__label">{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}
