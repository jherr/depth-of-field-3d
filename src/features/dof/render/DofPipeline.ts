import * as THREE from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'
import { MAX_KERNEL_SAMPLES, QUAD_VERT } from './shaders/common.ts'
import { COC_FRAG } from './shaders/coc.ts'
import {
  DILATE_NEAR_FRAG,
  DOWNSAMPLE_COC_FRAG,
  DOWNSAMPLE_COLOR_FRAG,
} from './shaders/downsample.ts'
import { GATHER_FRAG, REFERENCE_GATHER_FRAG } from './shaders/gather.ts'
import { COMPOSITE_FRAG, DEPTH_DEBUG_FRAG } from './shaders/composite.ts'
import { generateBokehKernel } from './bokehKernel.ts'

export type QualityTier = 'low' | 'medium' | 'high' | 'reference'
export type DebugMode = 'off' | 'linearDepth' | 'cocSigned' | 'nearAlpha'

export interface DofPipelineParams {
  readonly focalLengthMm: number
  readonly fNumber: number
  readonly focusDistanceM: number
  readonly sensorHeightMm: number
  readonly apertureBlades: number
  readonly roundness: number
  readonly bladeRotationRad: number
  readonly airyDiameterMm: number
  readonly diffraction: boolean
  readonly quality: QualityTier
  readonly debug: DebugMode
  readonly blurEnabled: boolean
  readonly exposure: number
}

export interface DofPipelineStats {
  readonly renderWidthPx: number
  readonly renderHeightPx: number
  readonly supersample: number
  readonly maxCocRadiusPxRequested: number
  readonly maxCocRadiusPxApplied: number
  /** True means the picture is LESS blurred than the numbers claim. */
  readonly cocClamped: boolean
  readonly kernelSamples: number
}

interface Tier {
  readonly supersample: number
  readonly samples: number
  /** Ceiling on gather radius, in full-resolution pixels. */
  readonly maxCocPx: number
  readonly reference: boolean
}

const TIERS: Record<QualityTier, Tier> = {
  low: { supersample: 1.0, samples: 16, maxCocPx: 40, reference: false },
  medium: { supersample: 1.25, samples: 32, maxCocPx: 64, reference: false },
  high: { supersample: 1.5, samples: 64, maxCocPx: 128, reference: false },
  // Ground truth: full resolution, single pass, no dilation shortcuts.
  reference: { supersample: 1.0, samples: 64, maxCocPx: 64, reference: true },
}

/** IEEE 754 half-precision to double, for reading back half-float targets. */
function halfToFloat(h: number): number {
  const sign = (h & 0x8000) === 0 ? 1 : -1
  const exponent = (h & 0x7c00) >> 10
  const fraction = h & 0x03ff
  if (exponent === 0) return sign * Math.pow(2, -14) * (fraction / 1024)
  if (exponent === 0x1f) return fraction === 0 ? sign * Infinity : Number.NaN
  return sign * Math.pow(2, exponent - 15) * (1 + fraction / 1024)
}

function makeTarget(
  w: number,
  h: number,
  opts: { depth?: boolean; format?: THREE.PixelFormat } = {},
): THREE.WebGLRenderTarget {
  const rt = new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    format: opts.format ?? THREE.RGBAFormat,
    // Linear light throughout; the sRGB encode happens once, in the composite.
    colorSpace: THREE.NoColorSpace,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: opts.depth ?? false,
    stencilBuffer: false,
    // No MSAA: a multisampled target cannot be resolved correctly alongside a
    // depth-texture gather, and anti-aliasing comes from supersampling instead.
    samples: 0,
  })
  return rt
}

/**
 * The depth-of-field render pipeline.
 *
 * A fixed six-stage graph: scene -> CoC -> half-res downsample -> near-field
 * dilation -> dual gather -> composite. Written directly against three's render
 * targets rather than using an effect-composer library, because the graph is
 * not user-composable and, more importantly, because every off-the-shelf DoF
 * effect exposes an arbitrary "bokeh scale" knob. The blur radius here is
 * derived from the thin-lens equation and nothing else.
 */
export class DofPipeline {
  private readonly renderer: THREE.WebGLRenderer
  private readonly quad: FullScreenQuad

  private width = 0
  private height = 0
  private supersample = 1

  private sceneRT: THREE.WebGLRenderTarget | null = null
  private depthTexture: THREE.DepthTexture | null = null
  private cocRT: THREE.WebGLRenderTarget | null = null
  private colorHalfRT: THREE.WebGLRenderTarget | null = null
  private cocHalfRT: THREE.WebGLRenderTarget | null = null
  private dilateA: THREE.WebGLRenderTarget | null = null
  private dilateB: THREE.WebGLRenderTarget | null = null
  private farRT: THREE.WebGLRenderTarget | null = null
  private nearRT: THREE.WebGLRenderTarget | null = null

  private readonly cocMat: THREE.ShaderMaterial
  private readonly dsColorMat: THREE.ShaderMaterial
  private readonly dsCocMat: THREE.ShaderMaterial
  private readonly dilateMat: THREE.ShaderMaterial
  private readonly gatherMat: THREE.ShaderMaterial
  private readonly referenceMat: THREE.ShaderMaterial
  private readonly compositeMat: THREE.ShaderMaterial
  private readonly depthDebugMat: THREE.ShaderMaterial

  private params: DofPipelineParams | null = null
  private kernelKey = ''
  private stats: DofPipelineStats = {
    renderWidthPx: 0,
    renderHeightPx: 0,
    supersample: 1,
    maxCocRadiusPxRequested: 0,
    maxCocRadiusPxApplied: 0,
    cocClamped: false,
    kernelSamples: 0,
  }

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer
    this.quad = new FullScreenQuad()

    const kernelUniform = (): { value: THREE.Vector2[] } => ({
      value: Array.from({ length: MAX_KERNEL_SAMPLES }, () => new THREE.Vector2()),
    })

    this.cocMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: COC_FRAG,
      uniforms: {
        tDepth: { value: null },
        cameraNear: { value: 0.05 },
        cameraFar: { value: 40 },
        uFocalMm: { value: 50 },
        uFNumber: { value: 1.4 },
        uFocusMm: { value: 3000 },
        uMmToPx: { value: 45 },
        uAiryMm: { value: 0 },
        uDiffraction: { value: 1 },
        uMaxCocPx: { value: 64 },
      },
      depthTest: false,
      depthWrite: false,
    })

    this.dsColorMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: DOWNSAMPLE_COLOR_FRAG,
      uniforms: { tColor: { value: null }, uTexelFull: { value: new THREE.Vector2() } },
      depthTest: false,
      depthWrite: false,
    })

    this.dsCocMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: DOWNSAMPLE_COC_FRAG,
      uniforms: { tCoc: { value: null }, uTexelFull: { value: new THREE.Vector2() } },
      depthTest: false,
      depthWrite: false,
    })

    this.dilateMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: DILATE_NEAR_FRAG,
      uniforms: {
        tSource: { value: null },
        uFromCoc: { value: 1 },
        uDirection: { value: new THREE.Vector2(1, 0) },
        uRadiusPx: { value: 8 },
      },
      depthTest: false,
      depthWrite: false,
    })

    this.gatherMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: GATHER_FRAG,
      uniforms: {
        tColor: { value: null },
        tCoc: { value: null },
        tNearRadius: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uKernel: kernelUniform(),
        uSamples: { value: 32 },
        uRotation: { value: 0 },
        uNearField: { value: 0 },
        uBlades: { value: 8 },
        uRoundness: { value: 0 },
        uBladeRotation: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    })

    this.referenceMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: REFERENCE_GATHER_FRAG,
      uniforms: {
        tColor: { value: null },
        tCoc: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uKernel: kernelUniform(),
        uSamples: { value: 64 },
        uRotation: { value: 0 },
        uBlades: { value: 8 },
        uRoundness: { value: 0 },
        uBladeRotation: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    })

    this.compositeMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: COMPOSITE_FRAG,
      uniforms: {
        tScene: { value: null },
        tCoc: { value: null },
        tFar: { value: null },
        tNear: { value: null },
        uTexelHalf: { value: new THREE.Vector2() },
        uBlurEnabled: { value: 1 },
        uExposure: { value: 1 },
        uDebugMode: { value: 0 },
        uMaxCocPx: { value: 64 },
      },
      depthTest: false,
      depthWrite: false,
    })

    this.depthDebugMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: DEPTH_DEBUG_FRAG,
      uniforms: {
        tDepth: { value: null },
        cameraNear: { value: 0.05 },
        cameraFar: { value: 40 },
        uRangeM: { value: 12 },
      },
      depthTest: false,
      depthWrite: false,
    })
  }

  setParams(params: DofPipelineParams): void {
    this.params = params
    this.ensureKernel(params)
  }

  private ensureKernel(p: DofPipelineParams): void {
    const tier = TIERS[p.quality]
    const key = `${tier.samples}|${p.apertureBlades}|${p.roundness.toFixed(3)}|${p.bladeRotationRad.toFixed(3)}`
    if (key === this.kernelKey) return
    this.kernelKey = key

    const kernel = generateBokehKernel({
      samples: tier.samples,
      blades: p.apertureBlades,
      roundness: p.roundness,
      rotationRad: p.bladeRotationRad,
    })

    for (const mat of [this.gatherMat, this.referenceMat]) {
      const arr = mat.uniforms.uKernel!.value as THREE.Vector2[]
      for (let i = 0; i < MAX_KERNEL_SAMPLES; i++) {
        const x = i * 2 < kernel.length ? kernel[i * 2]! : 0
        const y = i * 2 + 1 < kernel.length ? kernel[i * 2 + 1]! : 0
        arr[i]!.set(x, y)
      }
      mat.uniforms.uSamples!.value = tier.samples
      // The aperture shape has to reach the reach test, not just the taps.
      mat.uniforms.uBlades!.value = p.apertureBlades
      mat.uniforms.uRoundness!.value = p.roundness
      mat.uniforms.uBladeRotation!.value = p.bladeRotationRad
    }
  }

  private resize(cssWidth: number, cssHeight: number, pixelRatio: number, tier: Tier): void {
    const w = Math.max(2, Math.round(cssWidth * pixelRatio * tier.supersample))
    const h = Math.max(2, Math.round(cssHeight * pixelRatio * tier.supersample))
    if (w === this.width && h === this.height && tier.supersample === this.supersample) return

    this.width = w
    this.height = h
    this.supersample = tier.supersample

    this.disposeTargets()

    const depth = new THREE.DepthTexture(w, h)
    depth.type = THREE.UnsignedIntType
    depth.format = THREE.DepthFormat
    depth.minFilter = THREE.NearestFilter
    depth.magFilter = THREE.NearestFilter
    this.depthTexture = depth

    // Colour and depth come out of a single geometry pass, so they cannot
    // disagree with each other.
    const sceneRT = makeTarget(w, h, { depth: true })
    sceneRT.depthTexture = depth
    this.sceneRT = sceneRT

    this.cocRT = makeTarget(w, h)
    const hw = Math.max(1, Math.floor(w / 2))
    const hh = Math.max(1, Math.floor(h / 2))
    this.colorHalfRT = makeTarget(hw, hh)
    this.cocHalfRT = makeTarget(hw, hh, { format: THREE.RGFormat })
    this.dilateA = makeTarget(hw, hh, { format: THREE.RedFormat })
    this.dilateB = makeTarget(hw, hh, { format: THREE.RedFormat })
    this.farRT = makeTarget(hw, hh)
    this.nearRT = makeTarget(hw, hh)
  }

  private blit(material: THREE.Material, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = material
    this.renderer.setRenderTarget(target)
    this.renderer.clear()
    this.quad.render(this.renderer)
  }

  render(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    cssWidth: number,
    cssHeight: number,
  ): DofPipelineStats {
    const p = this.params
    if (!p) return this.stats

    const tier = TIERS[p.quality]
    const pixelRatio = this.renderer.getPixelRatio()
    this.resize(cssWidth, cssHeight, pixelRatio, tier)

    const sceneRT = this.sceneRT!
    const cocRT = this.cocRT!
    const w = this.width
    const h = this.height

    // ---- Stage 1: the scene, in HDR linear, with depth ----
    const previousTarget = this.renderer.getRenderTarget()
    this.renderer.setRenderTarget(sceneRT)
    this.renderer.clear()
    this.renderer.render(scene, camera)

    // ---- Stage 2: signed circle of confusion, in pixels ----
    // Pixels per millimetre uses the ACTUAL render height, which is what makes
    // the "N rendered pixels" sharpness criterion exact rather than nominal.
    const mmToPx = h / p.sensorHeightMm
    const maxRequested = this.requestedMaxRadiusPx(p, mmToPx, camera)

    const u = this.cocMat.uniforms
    u.tDepth!.value = this.depthTexture
    u.cameraNear!.value = camera.near
    u.cameraFar!.value = camera.far
    u.uFocalMm!.value = p.focalLengthMm
    u.uFNumber!.value = p.fNumber
    u.uFocusMm!.value = p.focusDistanceM * 1000
    u.uMmToPx!.value = mmToPx
    u.uAiryMm!.value = p.airyDiameterMm
    u.uDiffraction!.value = p.diffraction ? 1 : 0
    const maxApplied = tier.maxCocPx * this.supersample
    u.uMaxCocPx!.value = maxApplied
    this.blit(this.cocMat, cocRT)

    this.stats = {
      renderWidthPx: w,
      renderHeightPx: h,
      supersample: this.supersample,
      maxCocRadiusPxRequested: maxRequested,
      maxCocRadiusPxApplied: maxApplied,
      cocClamped: maxRequested > maxApplied * 1.02,
      kernelSamples: tier.samples,
    }

    if (p.debug === 'linearDepth') {
      const du = this.depthDebugMat.uniforms
      du.tDepth!.value = this.depthTexture
      du.cameraNear!.value = camera.near
      du.cameraFar!.value = camera.far
      this.blit(this.depthDebugMat, null)
      this.renderer.setRenderTarget(previousTarget)
      return this.stats
    }

    if (tier.reference && p.blurEnabled && p.debug === 'off') {
      // Ground-truth path: one full-resolution gather, straight to the screen.
      const ru = this.referenceMat.uniforms
      ru.tColor!.value = sceneRT.texture
      ru.tCoc!.value = cocRT.texture
      ;(ru.uTexel!.value as THREE.Vector2).set(1 / w, 1 / h)
      ru.uRotation!.value = 0
      this.blit(this.referenceMat, this.farRT)

      const cu = this.compositeMat.uniforms
      cu.tScene!.value = this.farRT!.texture
      cu.tCoc!.value = cocRT.texture
      cu.tFar!.value = this.farRT!.texture
      cu.tNear!.value = this.nearRT!.texture
      ;(cu.uTexelHalf!.value as THREE.Vector2).set(1 / w, 1 / h)
      cu.uBlurEnabled!.value = 0
      cu.uExposure!.value = p.exposure
      cu.uDebugMode!.value = 0
      cu.uMaxCocPx!.value = maxApplied
      this.blit(this.compositeMat, null)
      this.renderer.setRenderTarget(previousTarget)
      return this.stats
    }

    // ---- Stage 3: half-resolution colour and conservative CoC ----
    const hw = this.colorHalfRT!.width
    const hh = this.colorHalfRT!.height

    this.dsColorMat.uniforms.tColor!.value = sceneRT.texture
    ;(this.dsColorMat.uniforms.uTexelFull!.value as THREE.Vector2).set(1 / w, 1 / h)
    this.blit(this.dsColorMat, this.colorHalfRT)

    this.dsCocMat.uniforms.tCoc!.value = cocRT.texture
    ;(this.dsCocMat.uniforms.uTexelFull!.value as THREE.Vector2).set(1 / w, 1 / h)
    this.blit(this.dsCocMat, this.cocHalfRT)

    // ---- Stage 4: dilate the near field so it can spread past its silhouette ----
    const halfRadius = Math.max(1, (maxApplied / 2) * 0.5)
    const du = this.dilateMat.uniforms
    du.tSource!.value = this.cocHalfRT!.texture
    du.uFromCoc!.value = 1
    ;(du.uDirection!.value as THREE.Vector2).set(1 / hw, 0)
    du.uRadiusPx!.value = halfRadius
    this.blit(this.dilateMat, this.dilateA)

    du.tSource!.value = this.dilateA!.texture
    du.uFromCoc!.value = 0
    ;(du.uDirection!.value as THREE.Vector2).set(0, 1 / hh)
    this.blit(this.dilateMat, this.dilateB)

    // ---- Stage 5: dual gather ----
    const gu = this.gatherMat.uniforms
    gu.tColor!.value = this.colorHalfRT!.texture
    gu.tCoc!.value = this.cocHalfRT!.texture
    gu.tNearRadius!.value = this.dilateB!.texture
    ;(gu.uTexel!.value as THREE.Vector2).set(1 / hw, 1 / hh)
    gu.uRotation!.value = 0

    gu.uNearField!.value = 0
    this.blit(this.gatherMat, this.farRT)

    gu.uNearField!.value = 1
    this.blit(this.gatherMat, this.nearRT)

    // ---- Stage 6: composite, tone map, encode ----
    const cu = this.compositeMat.uniforms
    cu.tScene!.value = sceneRT.texture
    cu.tCoc!.value = cocRT.texture
    cu.tFar!.value = this.farRT!.texture
    cu.tNear!.value = this.nearRT!.texture
    ;(cu.uTexelHalf!.value as THREE.Vector2).set(1 / hw, 1 / hh)
    cu.uBlurEnabled!.value = p.blurEnabled ? 1 : 0
    cu.uExposure!.value = p.exposure
    cu.uDebugMode!.value = p.debug === 'cocSigned' ? 2 : p.debug === 'nearAlpha' ? 3 : 0
    cu.uMaxCocPx!.value = maxApplied
    this.blit(this.compositeMat, null)

    this.renderer.setRenderTarget(previousTarget)
    return this.stats
  }

  /**
   * The largest blur radius the optics actually ask for anywhere in the scene.
   *
   * Evaluated at the far clip plane, which is the worst case. Comparing it
   * against the tier's ceiling is what lets the HUD admit when the photograph
   * is less blurred than the numbers claim.
   */
  private requestedMaxRadiusPx(
    p: DofPipelineParams,
    mmToPx: number,
    camera: THREE.PerspectiveCamera,
  ): number {
    const f = p.focalLengthMm
    const sMm = p.focusDistanceM * 1000
    if (sMm <= f) return 0
    const aperture = (f * f) / (p.fNumber * (sMm - f))
    const zMm = camera.far * 1000
    const geo = Math.abs(aperture * ((zMm - sMm) / zMm))
    const eff = p.diffraction ? Math.hypot(geo, p.airyDiameterMm) : geo
    return (eff * mmToPx) / 2
  }

  /**
   * Read the GPU's own circle of confusion at one pixel.
   *
   * A shader cannot be unit tested, but it can be checked against the pure
   * optics module at runtime, which is stronger: this is what turns "the
   * picture and the numbers agree" into an enforced property rather than an
   * aspiration.
   */
  probe(
    uvX: number,
    uvY: number,
  ): { cocRadiusPx: number; linearDepthM: number } | { error: string } {
    if (!this.cocRT) return { error: 'no target' }
    const x = Math.floor(uvX * this.width)
    // GL reads bottom-up while UV space here is top-down.
    const y = Math.floor((1 - uvY) * this.height)
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return { error: 'out of range' }

    // The target is half float, so readPixels demands a Uint16Array. Passing a
    // Float32Array throws a type mismatch, which is easy to mistake for the
    // probe simply having nothing to report.
    const raw = new Uint16Array(4)
    try {
      this.renderer.readRenderTargetPixels(this.cocRT, x, y, 1, 1, raw)
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
    return {
      // Reported at full resolution, undoing the supersample, so it can be
      // compared directly against cocRadiusPx() from the optics module.
      cocRadiusPx: halfToFloat(raw[0]!) / this.supersample,
      linearDepthM: halfToFloat(raw[1]!),
    }
  }

  get currentStats(): DofPipelineStats {
    return this.stats
  }

  private disposeTargets(): void {
    for (const rt of [
      this.sceneRT,
      this.cocRT,
      this.colorHalfRT,
      this.cocHalfRT,
      this.dilateA,
      this.dilateB,
      this.farRT,
      this.nearRT,
    ]) {
      rt?.dispose()
    }
    this.depthTexture?.dispose()
  }

  dispose(): void {
    this.disposeTargets()
    this.quad.dispose()
    for (const m of [
      this.cocMat,
      this.dsColorMat,
      this.dsCocMat,
      this.dilateMat,
      this.gatherMat,
      this.referenceMat,
      this.compositeMat,
      this.depthDebugMat,
    ]) {
      m.dispose()
    }
  }
}
