import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { cocRadiusPx } from '#/lib/optics/coc.ts'
import type { DerivedOptics } from '../state/derive.ts'
import { useSimStore } from '../state/useSimStore.ts'
import { DofPipeline } from './DofPipeline.ts'

/**
 * Drives the depth-of-field pipeline from inside R3F.
 *
 * `useFrame` with a positive priority turns off R3F's automatic render and
 * hands over the renderer, so the pipeline owns the render path completely
 * while React still owns the scene graph. That is the whole reason to use R3F
 * here rather than vanilla three: declarative scene, imperative rendering, no
 * compromise on either.
 */
export function DofPipeline_({ derived }: { derived: DerivedOptics }) {
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)

  const quality = useSimStore((s) => s.quality)
  const debug = useSimStore((s) => s.debug)
  const blurEnabled = useSimStore((s) => s.blurEnabled)
  const bladeOverride = useSimStore((s) => s.bladeOverride)
  const roundnessOverride = useSimStore((s) => s.roundnessOverride)
  const setStats = useSimStore((s) => s.setStats)
  const setRenderHeightPx = useSimStore((s) => s.setRenderHeightPx)

  const pipeline = useMemo(() => new DofPipeline(gl), [gl])
  useEffect(() => () => pipeline.dispose(), [pipeline])

  const lastStatsKey = useRef('')
  const frames = useRef({ count: 0, last: performance.now(), fps: 0 })

  useEffect(() => {
    pipeline.setParams({
      focalLengthMm: derived.params.focalLengthMm,
      fNumber: derived.params.fNumber,
      focusDistanceM: derived.params.focusDistanceM,
      sensorHeightMm: derived.sensor.heightMm,
      apertureBlades: bladeOverride ?? derived.apertureBlades,
      roundness: roundnessOverride ?? derived.roundness,
      bladeRotationRad: 0.12,
      airyDiameterMm: derived.dof.airyDiameterMm,
      diffraction: derived.params.diffraction,
      quality,
      debug,
      blurEnabled,
      exposure: 1,
    })
  }, [pipeline, derived, quality, debug, blurEnabled, bladeOverride, roundnessOverride])

  useFrame(({ scene, camera }) => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return
    const stats = pipeline.render(scene, camera, size.width, size.height)

    // Close the loop on the "N rendered pixels" sharpness criterion.
    //
    // The shader works in drawing-buffer pixels, but the stage measures itself
    // in CSS pixels -- so on a retina display the two differ by the device
    // pixel ratio and the criterion would be off by exactly that factor. The
    // pipeline is the only component that knows the real buffer size, so it
    // publishes it rather than letting the UI guess.
    setRenderHeightPx(Math.round(stats.renderHeightPx / stats.supersample))

    const f = frames.current
    f.count++
    const now = performance.now()
    if (now - f.last >= 500) {
      f.fps = (f.count * 1000) / (now - f.last)
      f.count = 0
      f.last = now
    }

    // Only push to the store when something a human would notice changed,
    // so the render loop does not drive React 60 times a second.
    const key = `${stats.renderWidthPx}x${stats.renderHeightPx}|${stats.cocClamped}|${Math.round(
      stats.maxCocRadiusPxRequested,
    )}|${Math.round(f.fps)}`
    if (key !== lastStatsKey.current) {
      lastStatsKey.current = key
      setStats({
        renderWidthPx: stats.renderWidthPx,
        renderHeightPx: stats.renderHeightPx,
        supersample: stats.supersample,
        maxCocRadiusPxRequested: stats.maxCocRadiusPxRequested,
        maxCocRadiusPxApplied: stats.maxCocRadiusPxApplied,
        cocClamped: stats.cocClamped,
        kernelSamples: stats.kernelSamples,
        fps: f.fps,
      })
    }
  }, 1)


  // Expose the probe for the dev overlay and for automated verification.
  useEffect(() => {
    const api = {
      /**
       * Cross-check the GPU's circle of confusion against the pure optics
       * module at one pixel.
       *
       * The shader reports both its blur radius and the world depth it derived
       * that radius from, so the CPU can independently compute what the radius
       * should be at that depth. Any disagreement means the photograph and the
       * readouts have diverged -- the one failure this project cannot tolerate.
       */
      probe: (uvX: number, uvY: number) => {
        const gpu = pipeline.probe(uvX, uvY)
        if ('error' in gpu) return { error: gpu.error }
        const stats = pipeline.currentStats
        const fullResHeight = stats.renderHeightPx / stats.supersample
        const cpu = cocRadiusPx(
          {
            focalLengthMm: derived.params.focalLengthMm,
            fNumber: derived.params.fNumber,
            focusDistanceM: derived.params.focusDistanceM,
          },
          gpu.linearDepthM,
          derived.sensor.heightMm,
          fullResHeight,
        )
        const gpuAbs = Math.abs(gpu.cocRadiusPx)
        return {
          linearDepthM: gpu.linearDepthM,
          gpuCocRadiusPx: gpuAbs,
          cpuCocRadiusPx: cpu,
          relativeError: cpu > 0.01 ? Math.abs(gpuAbs - cpu) / cpu : 0,
          clamped: stats.cocClamped,
        }
      },
      stats: () => pipeline.currentStats,
      /**
       * The optics as the app currently understands them, so an external check
       * can confirm the rendered blur at the depth-of-field boundary really is
       * the blur the criterion asked for.
       */
      optics: () => ({
        focalLengthMm: derived.params.focalLengthMm,
        fNumber: derived.params.fNumber,
        focusDistanceM: derived.params.focusDistanceM,
        sensorHeightMm: derived.sensor.heightMm,
        cocLimitMm: derived.cocLimitMm,
        nearLimitM: derived.dof.nearLimitM,
        farLimitM: derived.dof.farLimitM,
        criterion: derived.params.cocCriterion,
      }),
      /** Blur radius the CPU predicts at a given distance, in render pixels. */
      cpuRadiusAt: (distanceM: number) => {
        const stats = pipeline.currentStats
        return cocRadiusPx(
          {
            focalLengthMm: derived.params.focalLengthMm,
            fNumber: derived.params.fNumber,
            focusDistanceM: derived.params.focusDistanceM,
          },
          distanceM,
          derived.sensor.heightMm,
          stats.renderHeightPx / stats.supersample,
        )
      },
    }
    ;(window as unknown as { __dofProbe?: typeof api }).__dofProbe = api
    return () => {
      delete (window as unknown as { __dofProbe?: typeof api }).__dofProbe
    }
  }, [pipeline, derived])

  return null
}

export { DofPipeline_ as DofPipeline }
