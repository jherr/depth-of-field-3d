import { create } from 'zustand'
import type { UnitSystem } from '#/lib/optics/format.ts'
import { DEFAULT_OPTICS, normalizeOpticsParams } from '#/lib/optics/params.ts'
import type { OpticsParams } from '#/lib/optics/params.ts'
import { instantiate } from '#/lib/scene/catalog.ts'
import type { CatalogKey } from '#/lib/scene/catalog.ts'
import { clampToRoom, moveProp as moveInLayout, rotateProp } from '#/lib/scene/layout.ts'
import type { Layout } from '#/lib/scene/layout.ts'
import { DEFAULT_SCENE_ID, getSceneDef, getSceneSpec } from '#/lib/scene/scenes.ts'
import type { SceneId } from '#/lib/scene/scenes.ts'
import type { SceneProp, Vec3 } from '#/lib/scene/types.ts'

export type ViewMode = 'thirdPerson' | 'inCamera' | 'split'
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
  /** Which venue is loaded. Picks the room, props and camera placement. */
  sceneId: SceneId
  layout: Layout
  /**
   * Props added this session, on top of `DEFAULT_SCENE`.
   *
   * Separate from `layout` because the two answer different questions: `layout`
   * overrides the transform of a prop that already exists, while this changes
   * what exists at all. Keeping them apart is also what lets `resetLayout` put
   * the furniture back without deleting anything the assistant brought in.
   */
  added: readonly SceneProp[]
  view: ViewMode
  /** Whether the controls sidebar is visible. Purely a layout preference. */
  sidebarOpen: boolean
  /** Whether the assistant panel is visible. Also just a layout preference. */
  chatOpen: boolean
  units: UnitSystem
  /**
   * LED pixel pitch for the moiré readout, millimetres.
   *
   * Lives in session state rather than on the wall prop so a designer can dial
   * in their actual wall (1.5 mm fine-pitch through 3.9 mm touring panels)
   * without editing the scene. The wall renders the same at any pitch -- it is
   * only the moiré risk comparison that depends on it.
   */
  ledWallPitchMm: number
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

  hydrate: (
    optics: OpticsParams,
    sceneId: SceneId,
    layout: Layout,
    view: ViewMode,
    units: UnitSystem,
    ledWallPitchMm: number,
  ) => void
  patchOptics: (patch: Partial<OpticsParams>) => void
  setLens: (lensId: string) => void
  /** Load a different venue, resetting the layout and bringing its suggested optics. */
  setScene: (sceneId: SceneId) => void
  setView: (view: ViewMode) => void
  toggleView: () => void
  setSidebarOpen: (on: boolean) => void
  toggleSidebar: () => void
  setChatOpen: (on: boolean) => void
  toggleChat: () => void
  /** Returns the id actually assigned, which may be suffixed to stay unique. */
  addProp: (key: CatalogKey, position: Vec3, rotationY: number) => string
  removeProp: (id: string) => boolean
  setUnits: (units: UnitSystem) => void
  setLedWallPitchMm: (pitchMm: number) => void
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
  sceneId: DEFAULT_SCENE_ID,
  ledWallPitchMm: 2.6,
  layout: {},
  added: [],
  view: 'thirdPerson',
  sidebarOpen: true,
  chatOpen: true,
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

  hydrate: (optics, sceneId, layout, view, units, ledWallPitchMm) =>
    set({ optics, sceneId, layout, view, units, ledWallPitchMm }),

  patchOptics: (patch) =>
    set((s) => ({ optics: normalizeOpticsParams({ ...s.optics, ...patch }) })),

  // Switching venue clears the per-prop overrides and session props -- they key
  // on ids that belong to the old scene -- and pulls in the new scene's
  // suggested glass so an 80 m stage does not open on a 50 mm lens focused at
  // 4 m. Selection is dropped for the same reason: it may name a gone prop.
  setScene: (sceneId) =>
    set((s) => ({
      sceneId,
      layout: {},
      added: [],
      hoveredPropId: null,
      selectedPropId: null,
      draggingPropId: null,
      optics: normalizeOpticsParams({ ...s.optics, ...getSceneDef(sceneId).suggestedOptics }),
    })),

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
  // Cycle third person -> in camera -> split -> third person.
  toggleView: () =>
    set((s) => ({
      view:
        s.view === 'thirdPerson' ? 'inCamera' : s.view === 'inCamera' ? 'split' : 'thirdPerson',
    })),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setChatOpen: (chatOpen) => set({ chatOpen }),
  toggleChat: () => set((s) => ({ chatOpen: !s.chatOpen })),

  addProp: (key, position, rotationY) => {
    const s = get()
    const scene = getSceneSpec(s.sceneId)
    const taken = new Set([
      ...scene.props.map((p) => p.id),
      ...s.added.map((p) => p.id),
    ])
    const prop = instantiate(key, position, rotationY, taken)
    // Clamped on the way in rather than trusted: the caller is often a language
    // model, and a prop placed through a wall is worse than one nudged inside.
    const clamped: SceneProp = {
      ...prop,
      transform: {
        ...prop.transform,
        position: clampToRoom(scene.room, prop.footprintRadiusM, prop.transform.position),
      },
    }
    set({ added: [...s.added, clamped] })
    return clamped.id
  },

  removeProp: (id) => {
    const s = get()
    if (!s.added.some((p) => p.id === id)) return false
    const { [id]: _dropped, ...layout } = s.layout
    set({ added: s.added.filter((p) => p.id !== id), layout })
    return true
  },
  setUnits: (units) => set({ units }),
  // Clamped to the span of real fine-pitch through touring panels; a zero or
  // negative pitch would make the moiré ratio meaningless.
  setLedWallPitchMm: (pitchMm) =>
    set({ ledWallPitchMm: Math.min(20, Math.max(0.5, Number.isFinite(pitchMm) ? pitchMm : 2.6)) }),
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
        clampToRoom(getSceneSpec(s.sceneId).room, footprintRadiusM, position),
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
