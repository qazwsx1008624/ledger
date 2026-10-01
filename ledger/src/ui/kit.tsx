import type { ReactNode } from 'react'

/* ------------------------------------------------------------------ */
/* 图标（stroke 风格，跟随 currentColor）                               */
/* ------------------------------------------------------------------ */

function Svg({ children, size = 22 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function IconPen({ size = 22 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </Svg>
  )
}

export function IconSun({ size = 22 }: { size?: number }) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Svg>
  )
}

export function IconChart({ size = 22 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M3 3v18h18" />
      <path d="M7 15l4-5 3 3 5-7" />
    </Svg>
  )
}

export function IconSliders({ size = 22 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
      <path d="M2 14h4M10 8h4M18 16h4" />
    </Svg>
  )
}

export function IconChevronLeft({ size = 22 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="m15 18-6-6 6-6" />
    </Svg>
  )
}

export function IconChevronRight({ size = 22 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="m9 18 6-6-6-6" />
    </Svg>
  )
}

export function IconArrowLeft({ size = 22 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </Svg>
  )
}

/* ------------------------------------------------------------------ */
/* 分段选择（支出/收入）                                                */
/* ------------------------------------------------------------------ */

interface SegmentedProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
}

export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          className={option.value === value ? 'segmented__item is-active' : 'segmented__item'}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 金额展示                                                            */
/* ------------------------------------------------------------------ */

interface MoneyProps {
  cents: number
  /** 是否显示元符号 */
  symbol?: boolean
}

export function Money({ cents, symbol = true }: MoneyProps) {
  const negative = cents < 0
  const abs = Math.abs(cents)
  const yuan = Math.floor(abs / 100)
  const fraction = String(abs % 100).padStart(2, '0')
  const grouped = yuan.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (
    <span className="money">
      {symbol && <span className="money__symbol">{negative ? '−¥' : '¥'}</span>}
      {grouped}
      <span className="money__fraction">.{fraction}</span>
    </span>
  )
}
