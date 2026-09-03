import { useEffect, useState } from 'react'
import { useSimStore } from '#/features/dof/state/useSimStore.ts'
import type { DebugMode, QualityTier } from '#/features/dof/state/useSimStore.ts'
import type { DerivedOptics } from '#/features/dof/state/derive.ts'
import { Check, Field, Group, Range, Segmented } from './controls.tsx'

interface ProbeResult {
  linearDepthM?: number
  gpuCocRadiusPx?: number
  cpuCocRadiusPx?: number
  relativeError?: number
  error?: string
}

/**
 * Render inspection, and the CoC probe.
 *
 * The probe is the mechanism that keeps this project honest. It reads back the
 * blur radius the GPU actually computed at the centre of the frame, together
 * with the world depth it derived it from, and compares that against what the
 * pure optics module says the radius should be at that depth. If those two
 * numbers ever drift apart, the photograph and the readouts have stopped
 * describing the same lens.
 */
export function DebugPanel({ derived }: { derived: DerivedOptics }) {
  const quality = useSimStore((s) => s.quality)
  const setQuality = useSimStore((s) => s.setQuality)
  const debug = useSimStore((s) => s.debug)
  const setDebug = useSimStore((s) => s.setDebug)
  const blurEnabled = useSimStore((s) => s.blurEnabled)
  const setBlurEnabled = useSimStore((s) => s.setBlurEnabled)
  const stats = useSimStore((s) => s.stats)
  const view = useSimStore((s) => s.view)
  const bladeOverride = useSimStore((s) => s.bladeOverride)
  const setBladeOverride = useSimStore((s) => s.setBladeOverride)
  const roundnessOverride = useSimStore((s) => s.roundnessOverride)
  const setRoundnessOverride = useSimStore((s) => s.setRoundnessOverride)

  const [probe, setProbe] = useState<ProbeResult | null>(null)

  useEffect(() => {
    if (view !== 'inCamera') {
      setProbe(null)
      return
    }
    const id = setInterval(() => {
      const api = (
        window as unknown as { __dofProbe?: { probe: (x: number, y: number) => ProbeResult | null } }
      ).__dofProbe
      setProbe(api?.probe(0.5, 0.5) ?? null)
    }, 600)
    return () => clearInterval(id)
  }, [view])

  return (
    <Group title="Render">
      <Field label="Quality" hint={qualityHint(quality)}>
        <Segmented<QualityTier>
          ariaLabel="Render quality"
          value={quality}
          options={[
            { value: 'low', label: 'Low', title: '16 taps, no supersampling' },
            { value: 'medium', label: 'Med', title: '32 taps' },
            { value: 'high', label: 'High', title: '64 taps, 1.5x supersampling' },
            { value: 'reference', label: 'Ref', title: 'Full-resolution ground truth' },
          ]}
          onChange={setQuality}
        />
      </Field>

      <Field label="Debug view">
        <Segmented<DebugMode>
          ariaLabel="Debug view"
          value={debug}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'linearDepth', label: 'Depth' },
            { value: 'cocSigned', label: 'CoC' },
            { value: 'nearAlpha', label: 'Near' },
          ]}
          onChange={setDebug}
        />
      </Field>

      <Check label="Blur enabled (B)" checked={blurEnabled} onChange={setBlurEnabled} />

      <Field
        label="Aperture blades"
        value={bladeOverride === null ? 'from lens' : String(bladeOverride)}
        hint="Force a low blade count to see the aperture polygon in the highlights. At realistic counts the effect is subtle: an octagon is only 7.6% off a circle."
      >
        <Range
          ariaLabel="Aperture blade override"
          min={2}
          max={12}
          step={1}
          value={bladeOverride ?? 2}
          onChange={(v) => setBladeOverride(v <= 2 ? null : v)}
        />
      </Field>

      <Field
        label="Blade roundness"
        value={roundnessOverride === null ? 'from lens' : roundnessOverride.toFixed(2)}
        hint="0 is a hard polygon, 1 is a circle."
      >
        <Range
          ariaLabel="Blade roundness override"
          min={-0.1}
          max={1}
          step={0.05}
          value={roundnessOverride ?? -0.1}
          onChange={(v) => setRoundnessOverride(v < 0 ? null : v)}
        />
      </Field>

      {stats && (
        <table className="sim-readout" style={{ marginTop: '0.5rem' }}>
          <tbody>
            <tr>
              <th scope="row">Buffer</th>
              <td>
                {stats.renderWidthPx}×{stats.renderHeightPx}
              </td>
            </tr>
            <tr>
              <th scope="row">Supersample</th>
              <td>{stats.supersample.toFixed(2)}×</td>
            </tr>
            <tr>
              <th scope="row">Kernel taps</th>
              <td>{stats.kernelSamples}</td>
            </tr>
            <tr>
              <th scope="row">Frame rate</th>
              <td>{stats.fps.toFixed(0)} fps</td>
            </tr>
            <tr className={stats.cocClamped ? 'is-warning' : undefined}>
              <th scope="row">Max blur</th>
              <td>
                {stats.maxCocRadiusPxRequested.toFixed(0)}/
                {stats.maxCocRadiusPxApplied.toFixed(0)} px
              </td>
            </tr>
          </tbody>
        </table>
      )}

      {view === 'inCamera' && (
        <>
          <div className="sim-group-title" style={{ marginTop: '0.7rem' }}>
            CoC probe · frame centre
          </div>
          {probe?.error && <p className="sim-hint">Probe unavailable: {probe.error}</p>}
          {probe && !probe.error && probe.cpuCocRadiusPx !== undefined && (
            <table className="sim-readout">
              <tbody>
                <tr>
                  <th scope="row">Depth</th>
                  <td>{probe.linearDepthM?.toFixed(3)} m</td>
                </tr>
                <tr>
                  <th scope="row">GPU radius</th>
                  <td>{probe.gpuCocRadiusPx?.toFixed(3)} px</td>
                </tr>
                <tr>
                  <th scope="row">CPU radius</th>
                  <td>{probe.cpuCocRadiusPx.toFixed(3)} px</td>
                </tr>
                <tr className={(probe.relativeError ?? 0) > 0.02 ? 'is-warning' : 'is-emphasis'}>
                  <th scope="row">Agreement</th>
                  <td>
                    {probe.cpuCocRadiusPx < 0.05
                      ? 'at focus'
                      : `${((probe.relativeError ?? 0) * 100).toFixed(3)}%`}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
          <p className="sim-hint">
            The shader's blur radius against the same optics module that produces the numbers
            above. These agree to a few thousandths of a pixel; the residual is half-float
            precision in the readback, not in the render.
          </p>
        </>
      )}

      <p className="sim-hint" style={{ marginTop: '0.5rem' }}>
        Derived: {derived.apertureBlades === 0 ? 'circular' : `${derived.apertureBlades} blades`},
        roundness {derived.roundness.toFixed(2)}, {derived.stopsDown.toFixed(1)} stops down.
      </p>
    </Group>
  )
}

function qualityHint(q: QualityTier): string {
  switch (q) {
    case 'low':
      return '16 taps at half resolution. For integrated graphics.'
    case 'medium':
      return '32 taps, 1.25× supersampling.'
    case 'high':
      return '64 taps, 1.5× supersampling.'
    case 'reference':
      return 'Full-resolution single-pass gather. Slow, and kept as ground truth: without it there is no way to tell a bug in the fast path from a limitation of it.'
  }
}
