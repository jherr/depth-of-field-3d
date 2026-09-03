import { DEFAULT_SCENE, CAMERA_PROP_ID, SUBJECT_PROP_ID, draggableProps, getProp } from '#/lib/scene/defaultScene.ts'
import { formatDistance } from '#/lib/optics/format.ts'
import type { UnitSystem } from '#/lib/optics/format.ts'
import { useSimStore } from '#/features/dof/state/useSimStore.ts'
import { Check, Group } from './controls.tsx'

function transformOf(layout: ReturnType<typeof useSimStore.getState>['layout'], id: string) {
  return layout[id] ?? getProp(DEFAULT_SCENE, id)!.transform
}

export function ScenePanel({ units }: { units: UnitSystem }) {
  const layout = useSimStore((s) => s.layout)
  const selected = useSimStore((s) => s.selectedPropId)
  const setSelected = useSimStore((s) => s.setSelected)
  const setHovered = useSimStore((s) => s.setHovered)
  const resetLayout = useSimStore((s) => s.resetLayout)
  const aimPropAt = useSimStore((s) => s.aimPropAt)
  const patchOptics = useSimStore((s) => s.patchOptics)
  const showFrustum = useSimStore((s) => s.showFrustum)
  const showDofVolume = useSimStore((s) => s.showDofVolume)
  const showRuler = useSimStore((s) => s.showRuler)
  const setShowFrustum = useSimStore((s) => s.setShowFrustum)
  const setShowDofVolume = useSimStore((s) => s.setShowDofVolume)
  const setShowRuler = useSimStore((s) => s.setShowRuler)

  const camera = transformOf(layout, CAMERA_PROP_ID)
  const subject = transformOf(layout, SUBJECT_PROP_ID)

  /**
   * Axial distance, not radial: the distance that matters optically is the
   * component along the camera's view direction, which is also what the
   * shader's depth buffer measures.
   */
  const focusOnSubject = (): void => {
    const dx = subject.position[0] - camera.position[0]
    const dz = subject.position[2] - camera.position[2]
    const fx = -Math.sin(camera.rotationY)
    const fz = -Math.cos(camera.rotationY)
    const axial = Math.abs(dx * fx + dz * fz)
    patchOptics({ focusDistanceM: Math.max(0.05, axial) })
  }

  const subjectDistance = Math.hypot(
    subject.position[0] - camera.position[0],
    subject.position[2] - camera.position[2],
  )

  return (
    <Group title="Scene">
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.55rem' }}>
        <button
          type="button"
          className="sim-btn"
          onClick={() => aimPropAt(CAMERA_PROP_ID, subject.position, camera.position)}
        >
          Aim at subject
        </button>
        <button type="button" className="sim-btn" onClick={focusOnSubject}>
          Focus on subject
        </button>
        <button type="button" className="sim-btn" onClick={resetLayout}>
          Reset layout
        </button>
      </div>

      <p className="sim-hint" style={{ marginBottom: '0.5rem' }}>
        Subject is {formatDistance(subjectDistance, units)} from the camera. Drag anything in the
        third-person view to move it; hold Shift to raise it, Ctrl to snap to 10 cm.
      </p>

      <Check label="View pyramid" checked={showFrustum} onChange={setShowFrustum} />
      <Check label="In-focus volume" checked={showDofVolume} onChange={setShowDofVolume} />
      <Check label="Depth ruler" checked={showRuler} onChange={setShowRuler} />

      <select
        className="sim-select"
        style={{ marginTop: '0.55rem' }}
        value={selected ?? ''}
        aria-label="Selected prop"
        onChange={(e) => setSelected(e.currentTarget.value || null)}
        onMouseLeave={() => setHovered(null)}
      >
        <option value="">Select an object…</option>
        {draggableProps(DEFAULT_SCENE).map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
    </Group>
  )
}
