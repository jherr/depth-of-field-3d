import { create } from 'zustand'
import type { UnitSystem } from '#/lib/optics/format.ts'
import { DEFAULT_OPTICS, normalizeOpticsParams } from '#/lib/optics/params.ts'
import type { OpticsParams } from '#/lib/optics/params.ts'
import { DEFAULT_SCENE } from '#/lib/scene/defaultScene.ts'
import { clampToRoom, moveProp as moveInLayout, rotateProp } from '#/lib/scene/layout.ts'
import type { Layout } from '#/lib/scene/layout.ts'
import type { Vec3 } from '#/lib/scene/types.ts'

export type ViewMode = 'thirdPerson' | 'inCamera'
export type QualityTier = 'low' | 'medium' | 'high' | 'reference'
export type DebugMode = 'off' | 'linearDepth' | 'cocSigned' | 'nearAlpha'

export interface PipelineStats {
  readonly renderWidthPx: number
  readonly renderHeightPx: number
  readonly supersample: number
  readonly maxCocRadiusPxRequested: number
  readonly maxCocRadiusPxApplied: number
  /** True means the picture no longer matches the numbers. Surfaced in the HUD. */
  readonly cocClamped: boolean
  readonly kernelSamples: number
  readonly fps: number
}

interface SimState {
  optics: OpticsParams
  layout: Layout
  view: ViewMode
  units: UnitSystem
  quality: QualityTier
  debug: DebugMode
  blurEnabled: boolean
  showDofVolume: boolean
  showFrustum: boolean
  showRuler: boolean
  hoveredPropId: string | null
  selectedPropId: string | null
  draggingPropId: string | null
  /** Height of the actual sensor viewport, needed by the renderPixels criterion. */
  renderHeightPx: number
  /**
   * Inspection overrides for the aperture shape.
   *
   * Polygonal bokeh is genuinely subtle at realistic blade counts -- an
   * octagon's apothem is only 7.6% shorter than its circumradius -- so being
   * able to force a low blade count is how you confirm the aperture polygon is
   * really driving the highlight shape rather than taking it on faith.
   */
  bladeOverride: number | null
  roundnessOverride: number | null
  stats: PipelineStats | null

  hydrate: (optics: OpticsParams, layout: Layout, view: ViewMode, units: UnitSystem) => void
  patchOptics: (patch: Partial<OpticsParams>) => void
  setLens: (lensId: string) => void
  setView: (view: ViewMode) => void
  toggleView: () => void
  setUnits: (units: UnitSystem) => void
  setQuality: (quality: QualityTier) => void
  setDebug: (debug: DebugMode) => void
  setBlurEnabled: (on: boolean) => void
  setShowDofVolume: (on: boolean) => void
  setShowFrustum: (on: boolean) => void
  setShowRuler: (on: boolean) => void
  setHovered: (id: string | null) => void
  setSelected: (id: string | null) => void
  setDragging: (id: string | null) => void
  dragPropTo: (id: string, position: Vec3, footprintRadiusM: number) => void
  rotatePropTo: (id: string, rotationY: number, fallback: Vec3) => void
  aimPropAt: (id: string, target: Vec3, fallback: Vec3) => void
  resetLayout: () => void
  setRenderHeightPx: (px: number) => void
  setStats: (stats: PipelineStats) => void
  setBladeOverride: (n: number | null) => void
  setRoundnessOverride: (n: number | null) => void
}

/**
 * Session state.
 *
 * This store is authoritative and the URL is a write-through sink: state is
 * hydrated from search params once on mount and never read back during the
 * session. Reading the URL back would introduce a one-frame pop every time a
 * drag ends and the router echoed the value.
 *
 * Nothing here updates per frame. Orbit camera pose lives inside
 * OrbitControls, and drag positions are written here but read through
 * `getState()` inside the render loop, so dragging causes no React re-render
 * of the 3D tree.
 */
export const useSimStore = create<SimState>((set, get) => ({
  optics: DEFAULT_OPTICS,
  layout: {},
  view: 'thirdPerson',
  units: 'metric',
  quality: 'high',
  debug: 'off',
  blurEnabled: true,
  showDofVolume: true,
  showFrustum: true,
  showRuler: true,
  hoveredPropId: null,
  selectedPropId: null,
  draggingPropId: null,
  renderHeightPx: 1080,
  bladeOverride: null,
  roundnessOverride: null,
  stats: null,

  hydrate: (optics, layout, view, units) => set({ optics, layout, view, units }),

  patchOptics: (patch) =>
    set((s) => ({ optics: normalizeOpticsParams({ ...s.optics, ...patch }) })),

  // Switching lens re-clamps focal length and aperture to what the new lens
  // can reach, which is why it goes through the normalizer rather than a
  // plain field assignment.
  setLens: (lensId) =>
    set((s) => ({
      optics: normalizeOpticsParams({
        ...s.optics,
        lensId,
        focalLengthMm: undefined,
        fNumber: undefined,
      }),
    })),

  setView: (view) => set({ view }),
  toggleView: () => set((s) => ({ view: s.view === 'inCamera' ? 'thirdPerson' : 'inCamera' })),
  setUnits: (units) => set({ units }),
  setQuality: (quality) => set({ quality }),
  setDebug: (debug) => set({ debug }),
  setBlurEnabled: (blurEnabled) => set({ blurEnabled }),
  setShowDofVolume: (showDofVolume) => set({ showDofVolume }),
  setShowFrustum: (showFrustum) => set({ showFrustum }),
  setShowRuler: (showRuler) => set({ showRuler }),
  setHovered: (hoveredPropId) => set({ hoveredPropId }),
  setSelected: (selectedPropId) => set({ selectedPropId }),
  setDragging: (draggingPropId) => set({ draggingPropId }),

  dragPropTo: (id, position, footprintRadiusM) =>
    set((s) => ({
      layout: moveInLayout(
        s.layout,
        id,
        clampToRoom(DEFAULT_SCENE.room, footprintRadiusM, position),
      ),
    })),

  rotatePropTo: (id, rotationY, fallback) =>
    set((s) => ({
      layout: rotateProp(s.layout, id, rotationY, s.layout[id]?.position ?? fallback),
    })),

  aimPropAt: (id, target, fallback) =>
    set((s) => {
      const from = s.layout[id]?.position ?? fallback
      // A three.js camera with rotation.y = 0 looks down -Z, so its forward
      // vector is (-sin, 0, -cos). Solving that for theta gives the negated
      // arguments below; using atan2(dx, dz) would aim it 180 degrees away.
      const rotationY = Math.atan2(-(target[0] - from[0]), -(target[2] - from[2]))
      return { layout: rotateProp(s.layout, id, rotationY, from) }
    }),

  resetLayout: () => set({ layout: {} }),
  setRenderHeightPx: (renderHeightPx) => {
    if (get().renderHeightPx !== renderHeightPx) set({ renderHeightPx })
  },
  setStats: (stats) => set({ stats }),
  setBladeOverride: (bladeOverride) => set({ bladeOverride }),
  setRoundnessOverride: (roundnessOverride) => set({ roundnessOverride }),
}))
