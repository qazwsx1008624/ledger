import type { ReactNode } from 'react'
import { IconChart, IconPen, IconSliders, IconSun } from './kit'

export type TabId = 'entry' | 'today' | 'month' | 'manage'

const TABS: ReadonlyArray<{ id: TabId; label: string; icon: ReactNode }> = [
  { id: 'entry', label: '记账', icon: <IconPen /> },
  { id: 'today', label: '今日', icon: <IconSun /> },
  { id: 'month', label: '本月', icon: <IconChart /> },
  { id: 'manage', label: '管理', icon: <IconSliders /> },
]

interface SideBarProps {
  page: TabId
  onChange: (page: TabId) => void
  /** 「本月」标签上的待补充角标 */
  pendingCount: number
}

/** 左侧悬浮竖排导航（按用户要求从底部移到侧面） */
export function SideBar({ page, onChange, pendingCount }: SideBarProps) {
  return (
    <nav className="sidebar" aria-label="主导航">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={page === tab.id ? 'sidebar__item is-active' : 'sidebar__item'}
          onClick={() => onChange(tab.id)}
          aria-current={page === tab.id ? 'page' : undefined}
        >
          <span className="sidebar__icon">
            {tab.icon}
            {tab.id === 'month' && pendingCount > 0 && <span className="sidebar__badge">{pendingCount}</span>}
          </span>
          <span className="sidebar__label">{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}
