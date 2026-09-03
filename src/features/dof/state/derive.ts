import { computeDof, diffractionLimitFNumber } from '#/lib/optics/dof.ts'
import type { DofResult } from '#/lib/optics/dof.ts'
import { SENSOR_FORMATS, resolveCocLimitMm } from '#/lib/optics/formats.ts'
import type { SensorFormat } from '#/lib/optics/formats.ts'
import { fieldOfView } from '#/lib/optics/fov.ts'
import type { FovResult } from '#/lib/optics/fov.ts'
import { getLens, maxApertureAt, stopsDownFromWideOpen } from '#/lib/optics/lenses.ts'
import type { LensPreset } from '#/lib/optics/lenses.ts'
import { DEFAULT_OPTICS } from '#/lib/optics/params.ts'
import type { OpticsParams } from '#/lib/optics/params.ts'
import { roundnessForStopsDown } from '#/features/dof/render/bokehKernel.ts'

export interface DerivedOptics {
  readonly params: OpticsParams
  readonly lens: LensPreset
  readonly sensor: SensorFormat
  readonly cocLimitMm: number
  readonly dof: DofResult
  readonly fov: FovResult
  /** Focal length that would give this field of view on full frame. */
  readonly equivalentFocalMm: number
  readonly maxApertureHere: number
  readonly stopsDown: number
  /** 0 = hard polygon, 1 = circle. Drives the bokeh kernel. */
  readonly roundness: number
  readonly apertureBlades: number
  readonly diffractionLimitFNumber: number
  /**
   * Focus distance measured from the image plane rather than the lens.
   *
   * The optics use the lens-plane datum because that is where the three.js
   * camera origin sits, which is what makes the render correct. Real lens
   * focus scales are engraved with the image-plane datum, so this is offered
   * as a display-only cross-reference.
   */
  readonly fromSensorPlaneM: number
}

/**
 * Everything the UI, the HUD and the shader need, derived once from the
 * parameters. Having a single derivation is what keeps the diagram, the
 * photograph and the readouts from ever disagreeing.
 *
 * `renderHeightPx` matters because the `renderPixels` CoC criterion is defined
 * in terms of the actual render target.
 */
export function deriveOptics(params: OpticsParams, renderHeightPx: number): DerivedOptics {
  const lens = getLens(params.lensId) ?? getLens(DEFAULT_OPTICS.lensId)!
  const sensor = SENSOR_FORMATS[params.sensorId]
  const cocLimitMm = resolveCocLimitMm(sensor, params.cocCriterion, renderHeightPx)

  const dof = computeDof({
    focalLengthMm: params.focalLengthMm,
    fNumber: params.fNumber,
    focusDistanceM: params.focusDistanceM,
    cocLimitMm,
    diffraction: params.diffraction,
  })

  const stopsDown = stopsDownFromWideOpen(lens, params.focalLengthMm, params.fNumber)
  const f = params.focalLengthMm
  const sMm = params.focusDistanceM * 1000

  return {
    params,
    lens,
    sensor,
    cocLimitMm,
    dof,
    fov: fieldOfView(f, sensor),
    equivalentFocalMm: f * sensor.cropFactor,
    maxApertureHere: maxApertureAt(lens, f),
    stopsDown,
    roundness: roundnessForStopsDown(stopsDown, lens.bladesAreRounded),
    apertureBlades: lens.apertureBlades,
    diffractionLimitFNumber: diffractionLimitFNumber(cocLimitMm),
    fromSensorPlaneM: sMm > f ? (sMm + (f * sMm) / (sMm - f)) / 1000 : params.focusDistanceM,
  }
}
