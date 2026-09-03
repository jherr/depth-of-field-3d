import { useState } from 'react'
import ThemeToggle from '#/components/ThemeToggle.tsx'
import { useSimStore } from '#/features/dof/state/useSimStore.ts'
import { Segmented } from './controls.tsx'

export function SimTopBar() {
  const view = useSimStore((s) => s.view)
  const setView = useSimStore((s) => s.setView)
  const units = useSimStore((s) => s.units)
  const setUnits = useSimStore((s) => s.setUnits)
  const [copied, setCopied] = useState(false)

  const copyLink = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard access can be denied; the URL is already shareable from the
      // address bar, so this is not worth interrupting the user over.
    }
  }

  return (
    <header className="sim-topbar">
      <span className="sim-title">Depth of Field</span>

      <Segmented
        ariaLabel="View"
        value={view}
        options={[
          { value: 'thirdPerson', label: 'Third person', title: 'Orbit the room (1)' },
          { value: 'inCamera', label: 'In camera', title: 'Look through the lens (2)' },
        ]}
        onChange={setView}
      />

      <span className="hud-spacer" />

      <Segmented
        ariaLabel="Units"
        value={units}
        options={[
          { value: 'metric', label: 'm' },
          { value: 'imperial', label: 'ft' },
        ]}
        onChange={setUnits}
      />

      <button type="button" className="sim-btn" onClick={() => void copyLink()}>
        {copied ? 'Copied' : 'Copy link'}
      </button>

      <ThemeToggle />
    </header>
  )
}
