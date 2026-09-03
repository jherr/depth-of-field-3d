import { formatDistance, formatFNumber, formatMm } from '#/lib/optics/format.ts'
import type { UnitSystem } from '#/lib/optics/format.ts'
import type { DerivedOptics } from '#/features/dof/state/derive.ts'
import { DOF_COLORS } from '#/features/dof/views/dofColors.ts'
import { Group } from './controls.tsx'

function Row({
  label,
  value,
  emphasis,
  warning,
  swatch,
}: {
  label: string
  value: string
  emphasis?: boolean
  warning?: boolean
  swatch?: string
}) {
  return (
    <tr className={warning ? 'is-warning' : emphasis ? 'is-emphasis' : undefined}>
      <th scope="row">
        {swatch !== undefined && (
          <span className="sim-swatch" style={{ background: swatch }} aria-hidden="true" />
        )}
        {label}
      </th>
      <td>{value}</td>
    </tr>
  )
}

export function DofReadout({
  derived,
  units,
}: {
  derived: DerivedOptics
  units: UnitSystem
}) {
  const { dof, params } = derived
  const d = (m: number): string => formatDistance(m, units)

  return (
    <Group title="Depth of field">
      <table className="sim-readout">
        <tbody>
          <Row label="Near limit" value={d(dof.nearLimitM)} swatch={DOF_COLORS.nearPlane} />
          <Row
            label="Plane of focus"
            value={d(params.focusDistanceM)}
            emphasis
            swatch={DOF_COLORS.focusPlane}
          />
          <Row label="Far limit" value={d(dof.farLimitM)} swatch={DOF_COLORS.farPlane} />
          <Row label="Total depth" value={d(dof.totalDofM)} emphasis />
          <Row label="In front" value={d(dof.inFrontM)} />
          <Row label="Behind" value={d(dof.behindM)} />
          <Row label="Hyperfocal" value={d(dof.hyperfocalM)} />
        </tbody>
      </table>

      {dof.isBeyondHyperfocal && (
        <p className="sim-hint">
          Focused at or past the hyperfocal distance, so everything from{' '}
          {d(dof.nearLimitM)} to infinity is acceptably sharp.
        </p>
      )}

      {dof.diffractionLimited && (
        <p className="sim-hint">
          <strong>Diffraction limited.</strong> The Airy disk is {formatMm(dof.airyDiameterMm)},
          already larger than the {formatMm(derived.cocLimitMm)} budget, so nothing in the frame
          reaches acceptable sharpness. Open up past{' '}
          {formatFNumber(derived.diffractionLimitFNumber)}.
        </p>
      )}

      {params.diffraction && !dof.diffractionLimited && dof.airyDiameterMm > 0.4 * derived.cocLimitMm && (
        <p className="sim-hint">
          Diffraction is eating into the budget: the Airy disk is{' '}
          {formatMm(dof.airyDiameterMm)} of the {formatMm(derived.cocLimitMm)} allowance. Geometry
          alone would claim {d(dof.geometric.nearLimitM)} to {d(dof.geometric.farLimitM)}.
        </p>
      )}
    </Group>
  )
}
