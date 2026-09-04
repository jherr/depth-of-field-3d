import { useEffect, useMemo } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { computeSensorViewport } from '#/lib/scene/viewport.ts'
import { sensorAspect } from '#/lib/optics/formats.ts'
import type { OpticsParams } from '#/lib/optics/params.ts'
import { deriveOptics } from './state/derive.ts'
import type { DerivedOptics } from './state/derive.ts'
import { layoutFromSearch, opticsFromSearch } from './state/searchSchema.ts'
import { useElementSize } from './state/useElementSize.ts'
import { useKeyboardShortcuts } from './state/useKeyboardShortcuts.ts'
import { useSimStore } from './state/useSimStore.ts'
import { useUrlWriteThrough } from './state/useUrlWriteThrough.ts'
import { CameraHud } from './ui/CameraHud.tsx'
import { ControlPanel } from './ui/ControlPanel.tsx'
import { DebugPanel } from './ui/DebugPanel.tsx'
import { LimitationsPanel } from './ui/LimitationsPanel.tsx'
import { ShortcutsHint } from './ui/ShortcutsHint.tsx'
import { DofReadout } from './ui/DofReadout.tsx'
import { ScenePanel } from './ui/ScenePanel.tsx'
import { SimTopBar } from './ui/SimTopBar.tsx'
import { SimulatorStage } from './SimulatorStage.tsx'

const routeApi = getRouteApi('/')

/**
 * One stage: a canvas rendered in a single camera mode, plus the in-camera HUD
 * overlay when it is looking through the lens.
 *
 * The stage measures its own box because the sensor letterbox and the HUD frame
 * must be computed against the *actual* pixels this canvas occupies -- in the
 * split view the in-camera half is only half as wide as the window, and letting
 * it measure itself is what keeps the frame lined up with the image.
 *
 * `ownsRenderHeight` marks the one stage whose height feeds the initial
 * `renderPixels` CoC estimate. In the split view that is the in-camera half;
 * with two stages writing the same store field, exactly one must win.
 */
function StageView({
  mode,
  derived,
  optics,
  ownsRenderHeight,
}: {
  mode: 'thirdPerson' | 'inCamera'
  derived: DerivedOptics
  optics: OpticsParams
  ownsRenderHeight: boolean
}) {
  const [stageRef, stageSize] = useElementSize<HTMLDivElement>()
  const units = useSimStore((s) => s.units)
  const stats = useSimStore((s) => s.stats)
  const blurEnabled = useSimStore((s) => s.blurEnabled)
  const setRenderHeightPx = useSimStore((s) => s.setRenderHeightPx)

  // The "2 rendered pixels" sharpness criterion is defined against the real
  // render target, so the pipeline's height has to feed back into the optics.
  const sensorViewport = useMemo(
    () =>
      computeSensorViewport(
        stageSize.width,
        stageSize.height,
        sensorAspect(deriveOptics(optics, 1080).sensor),
      ),
    [stageSize.width, stageSize.height, optics],
  )

  // Initial estimate only. Once the pipeline is running it publishes the real
  // drawing-buffer height, which is what the pixel-based criterion needs.
  useEffect(() => {
    if (!ownsRenderHeight) return
    if (sensorViewport.height > 0) {
      const dpr = Math.min(2, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1)
      setRenderHeightPx(Math.round(sensorViewport.height * dpr))
    }
  }, [ownsRenderHeight, sensorViewport.height, setRenderHeightPx])

  return (
    <div className="sim-stage" ref={stageRef}>
      <SimulatorStage derived={derived} size={stageSize} mode={mode} />
      {mode === 'inCamera' && (
        <CameraHud
          derived={derived}
          units={units}
          containerWidth={stageSize.width}
          containerHeight={stageSize.height}
          stats={stats}
          blurEnabled={blurEnabled}
        />
      )}
    </div>
  )
}

export default function Simulator() {
  const search = routeApi.useSearch()

  const view = useSimStore((s) => s.view)
  const units = useSimStore((s) => s.units)
  const optics = useSimStore((s) => s.optics)
  const sidebarOpen = useSimStore((s) => s.sidebarOpen)

  // Hydrate from the URL exactly once. After this the store is authoritative
  // and the URL is a write-through sink; see useUrlWriteThrough.
  useEffect(() => {
    useSimStore
      .getState()
      .hydrate(opticsFromSearch(search), layoutFromSearch(search), search.view, search.units)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useUrlWriteThrough()
  useKeyboardShortcuts()

  const renderHeightPx = useSimStore((s) => s.renderHeightPx)
  const derived = useMemo(() => deriveOptics(optics, renderHeightPx), [optics, renderHeightPx])

  return (
    <div className="sim-shell">
      <SimTopBar />
      <div className="sim-body">
        {view === 'split' ? (
          <div className="sim-split">
            <StageView mode="thirdPerson" derived={derived} optics={optics} ownsRenderHeight={false} />
            <StageView mode="inCamera" derived={derived} optics={optics} ownsRenderHeight />
          </div>
        ) : (
          <StageView mode={view} derived={derived} optics={optics} ownsRenderHeight />
        )}
        {sidebarOpen && (
          <aside className="sim-side">
            <ControlPanel derived={derived} />
            <DofReadout derived={derived} units={units} />
            <ScenePanel units={units} />
            <DebugPanel derived={derived} />
            <LimitationsPanel />
            <ShortcutsHint />
          </aside>
        )}
      </div>
    </div>
  )
}
