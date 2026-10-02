import { useMemo } from 'react'
import { formatDistance, formatFNumber } from '#/lib/optics/format.ts'
import type { UnitSystem } from '#/lib/optics/format.ts'
import {
  MOIRE_SAFE_RATIO,
  assessMoire,
} from '#/lib/optics/moire.ts'
import type { MoireRisk } from '#/lib/optics/moire.ts'
import { composeScene } from '#/lib/scene/layout.ts'
import { getSceneSpec } from '#/lib/scene/scenes.ts'
import type { SceneProp } from '#/lib/scene/types.ts'
import type { DerivedOptics } from '#/features/dof/state/derive.ts'
import { useSimStore } from '#/features/dof/state/useSimStore.ts'
import { axialDistanceM, cameraPoseFromLayout } from '#/features/dof/views/cameraRig.ts'
import { Field, Group } from './controls.tsx'

/** Common LED pixel pitches, fine-pitch through touring panels. */
const PITCH_PRESETS = [1.2, 1.5, 1.9, 2.6, 2.9, 3.9, 5.9] as const

const RISK_UI: Record<MoireRisk, { label: string; color: string }> = {
  safe: { label: 'Safe', color: '#3fb950' },
  marginal: { label: 'Marginal', color: '#d29922' },
  risk: { label: 'Moiré likely', color: '#f85149' },
}

function findLedWall(props: readonly SceneProp[]): SceneProp | undefined {
  return props.find(
    (p) => p.geometry.kind === 'procedural' && p.geometry.shape.type === 'ledWall',
  )
}

const mm = (v: number): string => `${v.toFixed(1)} mm`

/**
 * Will this shot see moiré on the LED wall?
 *
 * Only rendered when the active scene actually contains a wall, so it is absent
 * in the living room and present on the LED stage. The whole panel is a reading
 * of one comparison: the defocus blur the wall falls under, measured against the
 * LED pixel pitch. See `lib/optics/moire.ts` for the physics.
 */
export function MoireReadout({
  derived,
  units,
}: {
  derived: DerivedOptics
  units: UnitSystem
}) {
  const sceneId = useSimStore((s) => s.sceneId)
  const layout = useSimStore((s) => s.layout)
  const added = useSimStore((s) => s.added)
  const pitchMm = useSimStore((s) => s.ledWallPitchMm)
  const setPitch = useSimStore((s) => s.setLedWallPitchMm)

  const wall = useMemo(() => {
    const scene = composeScene(added, layout, getSceneSpec(sceneId))
    return findLedWall(scene.props)
  }, [added, layout, sceneId])

  const wallDistanceM = useMemo(() => {
    if (!wall) return 0
    const pose = cameraPoseFromLayout(layout, getSceneSpec(sceneId))
    return axialDistanceM(pose, wall.transform.position)
  }, [wall, layout, sceneId])

  // Nothing to read if the scene has no wall.
  if (!wall) return null

  const { params } = derived
  const assessment = assessMoire(
    {
      focalLengthMm: params.focalLengthMm,
      fNumber: params.fNumber,
      focusDistanceM: params.focusDistanceM,
    },
    { distanceM: wallDistanceM, pitchMm },
  )
  const ui = RISK_UI[assessment.risk]
  const safeN = assessment.safeFNumber
  const guidance = guidanceFor(assessment.risk, safeN, params.fNumber)

  // A pitch dialled in from a URL may not be one of the presets; show it anyway.
  const pitchOptions = PITCH_PRESETS.includes(pitchMm as (typeof PITCH_PRESETS)[number])
    ? PITCH_PRESETS
    : [...PITCH_PRESETS, pitchMm].sort((a, b) => a - b)

  return (
    <Group title="LED wall moiré">
      <Field label="Pixel pitch" hint="Centre-to-centre spacing of the wall's LEDs.">
        <select
          className="sim-select"
          value={pitchMm}
          aria-label="LED pixel pitch"
          onChange={(e) => setPitch(Number(e.currentTarget.value))}
        >
          {pitchOptions.map((p) => (
            <option key={p} value={p}>
              {p.toFixed(1)} mm
            </option>
          ))}
        </select>
      </Field>

      <div
        className="sim-badge"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          margin: '0.1rem 0 0.55rem',
          padding: '0.4rem 0.6rem',
          borderRadius: '0.4rem',
          background: `${ui.color}22`,
          border: `1px solid ${ui.color}66`,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: '0.7rem',
            height: '0.7rem',
            borderRadius: '50%',
            background: ui.color,
            flex: '0 0 auto',
          }}
        />
        <strong style={{ color: ui.color }}>{ui.label}</strong>
        <span className="sim-value" style={{ marginLeft: 'auto' }}>
          {assessment.ratio.toFixed(1)}× pitch
        </span>
      </div>

      <table className="sim-readout">
        <tbody>
          <tr>
            <th scope="row">Wall distance</th>
            <td>{formatDistance(wallDistanceM, units)}</td>
          </tr>
          <tr>
            <th scope="row">Blur at wall</th>
            <td>{mm(assessment.blurMm)}</td>
          </tr>
          <tr className="is-emphasis">
            <th scope="row">Coverage</th>
            <td>
              {assessment.ratio.toFixed(1)} pixels (need {MOIRE_SAFE_RATIO})
            </td>
          </tr>
          <tr>
            <th scope="row">Safe up to</th>
            <td>{safeN === null ? '—' : formatFNumber(safeN)}</td>
          </tr>
        </tbody>
      </table>

      <p className="sim-hint">{guidance}</p>
    </Group>
  )
}

function guidanceFor(risk: MoireRisk, safeN: number | null, currentF: number): string {
  if (risk === 'safe') {
    if (safeN !== null && safeN > currentF + 0.05) {
      return `The wall is well out of focus. You have headroom — stopping down to ${formatFNumber(
        safeN,
      )} would still clear it.`
    }
    return 'The wall is well out of focus; its pixel grid is smeared below the frequency that aliases.'
  }

  if (safeN === null) {
    return 'Focus is sitting on the wall, so it is razor sharp. Pull focus in front of it (onto the presenter) to throw the panel out of focus.'
  }

  if (safeN < 0.95) {
    return 'Even wide open the wall stays too sharp at this framing. Use a longer lens, move the camera back, or pull focus well in front of the wall.'
  }

  if (risk === 'marginal') {
    return `Close. Open up to ${formatFNumber(safeN)} or wider — or focus a touch closer — to put the wall safely out of focus.`
  }

  return `The wall is too sharp. Open up to about ${formatFNumber(
    safeN,
  )} (or wider), reach for a longer lens, or move the camera back / focus closer.`
}
