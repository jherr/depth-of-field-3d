import type { ReactNode } from 'react'

export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="sim-group">
      <h2 className="sim-group-title">{title}</h2>
      {children}
    </section>
  )
}

export function Field({
  label,
  value,
  hint,
  children,
}: {
  label: string
  value?: ReactNode
  hint?: ReactNode
  children?: ReactNode
}) {
  return (
    <label className="sim-field">
      <span className="sim-field-head">
        <span className="sim-label">{label}</span>
        {value !== undefined && <span className="sim-value">{value}</span>}
      </span>
      {children}
      {hint !== undefined && <span className="sim-hint">{hint}</span>}
    </label>
  )
}

export function Range({
  min,
  max,
  step,
  value,
  disabled,
  onChange,
  ariaLabel,
}: {
  min: number
  max: number
  step: number
  value: number
  disabled?: boolean
  onChange: (v: number) => void
  ariaLabel: string
}) {
  return (
    <input
      className="sim-range"
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      // `onInput` rather than `onChange` so the value tracks the drag live.
      onInput={(e) => onChange(Number(e.currentTarget.value))}
      onChange={(e) => onChange(Number(e.currentTarget.value))}
    />
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: ReadonlyArray<{ value: T; label: string; title?: string }>
  value: T
  onChange: (v: T) => void
  ariaLabel: string
}) {
  return (
    <div className="sim-seg" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Check({
  label,
  checked,
  onChange,
  title,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  title?: string
}) {
  return (
    <label className="sim-check" title={title}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
      <span>{label}</span>
    </label>
  )
}
