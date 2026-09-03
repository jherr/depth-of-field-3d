import { useMemo } from 'react'
import { SENSOR_FORMAT_LIST } from '#/lib/optics/formats.ts'
import type { CocCriterion } from '#/lib/optics/formats.ts'
import { formatDistance, formatFNumber, formatFocalLength } from '#/lib/optics/format.ts'
import { LENS_PRESETS, MAX_FOCUS_DISTANCE_M, availableStops, isPrime } from '#/lib/optics/lenses.ts'
import { useSimStore } from '#/features/dof/state/useSimStore.ts'
import type { DerivedOptics } from '#/features/dof/state/derive.ts'
import { Check, Field, Group, Range, Segmented } from './controls.tsx'

/** Focus distance spans four orders of magnitude, so the slider is logarithmic. */
const FOCUS_SLIDER_STEPS = 1000
const focusToSlider = (m: number, min: number, max: number): number =>
  (Math.log(Math.max(min, m) / min) / Math.log(max / min)) * FOCUS_SLIDER_STEPS
const sliderToFocus = (v: number, min: number, max: number): number =>
  min * Math.pow(max / min, v / FOCUS_SLIDER_STEPS)

const COC_OPTIONS = ['convention', 'div1500', 'px2'] as const
type CocOption = (typeof COC_OPTIONS)[number]

const criterionToOption = (c: CocCriterion): CocOption =>
  c.kind === 'renderPixels' ? 'px2' : c.kind === 'diagonalDivisor' ? 'div1500' : 'convention'

const optionToCriterion = (o: CocOption): CocCriterion =>
  o === 'px2'
    ? { kind: 'renderPixels', px: 2 }
    : o === 'div1500'
      ? { kind: 'diagonalDivisor', divisor: 1500 }
      : { kind: 'formatConvention' }

export function ControlPanel({ derived }: { derived: DerivedOptics }) {
  const { params, lens, sensor } = derived
  const patchOptics = useSimStore((s) => s.patchOptics)
  const setLens = useSimStore((s) => s.setLens)
  const units = useSimStore((s) => s.units)

  const stops = useMemo(() => availableStops(lens, params.focalLengthMm), [lens, params.focalLengthMm])
  const stopIndex = Math.max(
    0,
    stops.findIndex((s) => Math.abs(s - params.fNumber) < 1e-9),
  )
  const prime = isPrime(lens)
  const focusMax = Math.min(MAX_FOCUS_DISTANCE_M, 100)

  return (
    <>
      <Group title="Camera">
        <Field label="Lens">
          <select
            className="sim-select"
            value={lens.id}
            aria-label="Lens"
            onChange={(e) => setLens(e.currentTarget.value)}
          >
            {LENS_PRESETS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Sensor">
          <select
            className="sim-select"
            value={sensor.id}
            aria-label="Sensor format"
            onChange={(e) => patchOptics({ sensorId: e.currentTarget.value as typeof sensor.id })}
          >
            {SENSOR_FORMAT_LIST.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label} · {f.cropFactor.toFixed(2)}×
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Focal length"
          value={formatFocalLength(params.focalLengthMm)}
          hint={
            prime
              ? 'Prime lens — fixed focal length.'
              : `${derived.equivalentFocalMm.toFixed(0)}mm equivalent · ${derived.fov.diagFovDeg.toFixed(1)}° diagonal`
          }
        >
          <Range
            ariaLabel="Focal length"
            min={lens.focalRangeMm[0]}
            max={lens.focalRangeMm[1]}
            step={1}
            value={params.focalLengthMm}
            disabled={prime}
            onChange={(v) => patchOptics({ focalLengthMm: v })}
          />
        </Field>

        <Field
          label="Aperture"
          value={formatFNumber(params.fNumber)}
          hint={
            stops.length <= 1
              ? 'Fixed aperture — no diaphragm.'
              : `Wide open ${formatFNumber(derived.maxApertureHere)} · ${derived.apertureBlades === 0 ? 'circular opening' : `${derived.apertureBlades} blades`}`
          }
        >
          <Range
            ariaLabel="Aperture"
            min={0}
            max={Math.max(0, stops.length - 1)}
            step={1}
            value={stopIndex}
            disabled={stops.length <= 1}
            onChange={(i) => patchOptics({ fNumber: stops[i] ?? params.fNumber })}
          />
        </Field>

        <Field
          label="Focus distance"
          value={formatDistance(params.focusDistanceM, units)}
          hint={`From the lens. ${formatDistance(derived.fromSensorPlaneM, units)} from the sensor plane.`}
        >
          <Range
            ariaLabel="Focus distance"
            min={0}
            max={FOCUS_SLIDER_STEPS}
            step={1}
            value={focusToSlider(params.focusDistanceM, lens.minFocusDistanceM, focusMax)}
            onChange={(v) =>
              patchOptics({ focusDistanceM: sliderToFocus(v, lens.minFocusDistanceM, focusMax) })
            }
          />
        </Field>
      </Group>

      <Group title="Sharpness criterion">
        <Field
          label="Acceptable blur"
          value={`${derived.cocLimitMm.toFixed(4)} mm`}
          hint={
            criterionToOption(params.cocCriterion) === 'px2'
              ? 'The depth-of-field limits now sit exactly where the rendered blur reaches 2 pixels. Switch views to see the slab and the photograph agree.'
              : criterionToOption(params.cocCriterion) === 'div1500'
                ? 'Sensor diagonal ÷ 1500. Internally consistent, but 3–6% off the published tables.'
                : 'The published convention for this format, so the numbers match PhotoPills and DOFMaster.'
          }
        >
          <Segmented
            ariaLabel="Circle of confusion criterion"
            value={criterionToOption(params.cocCriterion)}
            options={[
              { value: 'convention', label: 'Published', title: 'Per-format convention' },
              { value: 'div1500', label: 'd÷1500', title: 'Sensor diagonal over 1500' },
              { value: 'px2', label: '2 px', title: 'Two pixels of rendered blur' },
            ]}
            onChange={(o) => patchOptics({ cocCriterion: optionToCriterion(o) })}
          />
        </Field>

        <Check
          label="Model diffraction"
          checked={params.diffraction}
          title="Combines the Airy disk with defocus blur in quadrature"
          onChange={(v) => patchOptics({ diffraction: v })}
        />
        <span className="sim-hint">
          Diffraction alone fills the budget at {formatFNumber(derived.diffractionLimitFNumber)} on
          this format. Beyond that, stopping down makes things worse.
        </span>
      </Group>
    </>
  )
}
