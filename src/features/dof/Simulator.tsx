import { useEffect, useMemo } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { computeSensorViewport } from '#/lib/scene/viewport.ts'
import { sensorAspect } from '#/lib/optics/formats.ts'
import { deriveOptics } from './state/derive.ts'
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

export default function Simulator() {
  const search = routeApi.useSearch()
  const [stageRef, stageSize] = useElementSize<HTMLDivElement>()

  const view = useSimStore((s) => s.view)
  const units = useSimStore((s) => s.units)
  const optics = useSimStore((s) => s.optics)
  const blurEnabled = useSimStore((s) => s.blurEnabled)
  const stats = useSimStore((s) => s.stats)
  const setRenderHeightPx = useSimStore((s) => s.setRenderHeightPx)

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

  // The "2 rendered pixels" sharpness criterion is defined against the real
  // render target, so the pipeline's height has to feed back into the optics.
  const sensorViewport = useMemo(
    () => computeSensorViewport(stageSize.width, stageSize.height, sensorAspect(
      deriveOptics(optics, 1080).sensor,
    )),
    [stageSize.width, stageSize.height, optics],
  )

  // Initial estimate only. Once the pipeline is running it publishes the real
  // drawing-buffer height, which is what the pixel-based criterion needs.
  useEffect(() => {
    if (sensorViewport.height > 0) {
      const dpr = Math.min(2, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1)
      setRenderHeightPx(Math.round(sensorViewport.height * dpr))
    }
  }, [sensorViewport.height, setRenderHeightPx])

  const renderHeightPx = useSimStore((s) => s.renderHeightPx)
  const derived = useMemo(() => deriveOptics(optics, renderHeightPx), [optics, renderHeightPx])

  return (
    <div className="sim-shell">
      <SimTopBar />
      <div className="sim-body">
        <div className="sim-stage" ref={stageRef}>
          <SimulatorStage derived={derived} size={stageSize} />
          {view === 'inCamera' && (
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
        <aside className="sim-side">
          <ControlPanel derived={derived} />
          <DofReadout derived={derived} units={units} />
          <ScenePanel units={units} />
          <DebugPanel derived={derived} />
          <LimitationsPanel />
          <ShortcutsHint />
        </aside>
      </div>
    </div>
  )
}
