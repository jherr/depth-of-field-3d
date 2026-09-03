import { formatDistance, formatFNumber, formatFocalLength } from '#/lib/optics/format.ts'
import type { UnitSystem } from '#/lib/optics/format.ts'
import { computeSensorViewport } from '#/lib/scene/viewport.ts'
import { sensorAspect } from '#/lib/optics/formats.ts'
import type { DerivedOptics } from '#/features/dof/state/derive.ts'
import type { PipelineStats } from '#/features/dof/state/useSimStore.ts'

function Item({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <span className={warn ? 'hud-item hud-warn' : 'hud-item'}>
      <span>{label}</span>
      <span>{value}</span>
    </span>
  )
}

/**
 * The in-camera overlay.
 *
 * The frame rectangle is derived from `computeSensorViewport`, the same
 * function the renderer uses to size its target, so the HUD's frame lines up
 * with the rendered image to the pixel rather than approximately.
 */
export function CameraHud({
  derived,
  units,
  containerWidth,
  containerHeight,
  stats,
  blurEnabled,
}: {
  derived: DerivedOptics
  units: UnitSystem
  containerWidth: number
  containerHeight: number
  stats: PipelineStats | null
  blurEnabled: boolean
}) {
  const { params, dof, sensor, lens } = derived
  const v = computeSensorViewport(containerWidth, containerHeight, sensorAspect(sensor))
  const d = (m: number): string => formatDistance(m, units)

  const frame = { left: v.x, top: v.y, width: v.width, height: v.height }
  const corner = 16

  return (
    <div className="hud-root" aria-hidden="true">
      <div className="hud-frame" style={frame}>
        <div className="hud-thirds" />

        <div className="hud-corner" style={{ left: -1, top: -1, borderWidth: '2px 0 0 2px', width: corner, height: corner }} />
        <div className="hud-corner" style={{ right: -1, top: -1, borderWidth: '2px 2px 0 0', width: corner, height: corner }} />
        <div className="hud-corner" style={{ left: -1, bottom: -1, borderWidth: '0 0 2px 2px', width: corner, height: corner }} />
        <div className="hud-corner" style={{ right: -1, bottom: -1, borderWidth: '0 2px 2px 0', width: corner, height: corner }} />

        <div className="hud-focus-mark" />

        <div className="hud-bar is-top">
          <span className="hud-rec">●</span>
          <Item label="" value={formatFocalLength(params.focalLengthMm)} />
          <Item label="" value={formatFNumber(params.fNumber)} />
          <span className="hud-spacer" />
          <Item label="" value={sensor.shortLabel} />
          <Item label="AF" value={d(params.focusDistanceM)} />
        </div>

        <div className="hud-bar is-bottom">
          <Item label="near" value={d(dof.nearLimitM)} />
          <Item label="far" value={d(dof.farLimitM)} />
          <Item label="dof" value={d(dof.totalDofM)} />
          <Item label="hyp" value={d(dof.hyperfocalM)} />
          <Item label="coc" value={`${derived.cocLimitMm.toFixed(3)}mm`} />
          <span className="hud-spacer" />
          {dof.diffractionLimited && <Item label="" value="DIFFRACTION LIMITED" warn />}
          {!blurEnabled && <Item label="" value="BLUR OFF" warn />}
          <Item label="" value={`${derived.equivalentFocalMm.toFixed(0)}mm eq`} />
          <Item label="" value={lens.apertureBlades === 0 ? 'circular' : `${lens.apertureBlades} blades`} />
        </div>

        {stats?.cocClamped && (
          <div className="hud-bar" style={{ top: '2rem' }}>
            {/*
              The blur radius hit the pipeline's ceiling, which means the
              photograph is now LESS blurred than the numbers claim. Saying so
              is the honest option.
            */}
            <span className="hud-badge">
              blur clamped · showing {stats.maxCocRadiusPxApplied.toFixed(0)}px of{' '}
              {stats.maxCocRadiusPxRequested.toFixed(0)}px
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
