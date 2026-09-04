import { useState } from 'react'
import ThemeToggle from '#/components/ThemeToggle.tsx'
import { useSimStore } from '#/features/dof/state/useSimStore.ts'
import { Segmented } from './controls.tsx'

export function SimTopBar() {
  const view = useSimStore((s) => s.view)
  const setView = useSimStore((s) => s.setView)
  const units = useSimStore((s) => s.units)
  const setUnits = useSimStore((s) => s.setUnits)
  const sidebarOpen = useSimStore((s) => s.sidebarOpen)
  const toggleSidebar = useSimStore((s) => s.toggleSidebar)
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
          { value: 'split', label: 'Split', title: '3D model and camera side by side (3)' },
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

      <button
        type="button"
        className="sim-icon-btn"
        aria-label={sidebarOpen ? 'Hide controls' : 'Show controls'}
        aria-pressed={sidebarOpen}
        title={sidebarOpen ? 'Hide controls' : 'Show controls'}
        onClick={toggleSidebar}
      >
        <SidebarIcon open={sidebarOpen} />
      </button>

      <ThemeToggle />
    </header>
  )
}

function SidebarIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="15" y1="4" x2="15" y2="20" />
      {open && <rect x="16.5" y="7" width="3.5" height="10" rx="0.6" fill="currentColor" stroke="none" />}
    </svg>
  )
}
