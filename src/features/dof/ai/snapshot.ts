import { useSimStore } from '#/features/dof/state/useSimStore.ts'
import type { ViewMode } from '#/features/dof/state/useSimStore.ts'

export type StageMode = 'thirdPerson' | 'inCamera'

/**
 * Live canvases, keyed by which camera they are rendering.
 *
 * A module-level registry rather than React state because the consumer is a
 * chat tool, not a component -- it runs from an async tool handler with no
 * hooks available and no place in the tree to read a ref from.
 *
 * At most one canvas exists per mode. In the split view both are mounted; in
 * either single view only one is, which is why {@link captureStage} may have to
 * change the view before it can photograph anything.
 */
const canvases = new Map<StageMode, HTMLCanvasElement>()

export function registerStageCanvas(mode: StageMode, canvas: HTMLCanvasElement) {
  canvases.set(mode, canvas)
}

/**
 * Drop a canvas, but only if it is still the one registered.
 *
 * Changing the view remounts both stages, and React commits the new mount
 * before running the old one's cleanup. An unconditional `delete` in that
 * cleanup therefore removes the *replacement*, and a plain overwrite leaves the
 * dead canvas in place if the order goes the other way. Checking identity is
 * what makes the registry correct under either ordering.
 */
export function unregisterStageCanvas(mode: StageMode, canvas: HTMLCanvasElement | null) {
  if (canvas && canvases.get(mode) === canvas) canvases.delete(mode)
}

/** Longest edge of a returned snapshot. */
const MAX_EDGE = 1024

const raf = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

/**
 * Has this canvas actually drawn a scene yet?
 *
 * Presence is not enough and neither is a frame count. A stage that has been
 * sized but not rendered reads as a single flat colour, and so does one whose
 * WebGL context was lost -- both of which produce a confidently-described blank
 * image if handed to a vision model. Downscaling to 32x32 and looking for any
 * variation at all is a cheap, direct test of the thing that matters.
 */
function hasDrawn(canvas: HTMLCanvasElement): boolean {
  const probe = document.createElement('canvas')
  probe.width = 32
  probe.height = 32
  const ctx = probe.getContext('2d', { willReadFrequently: true })
  if (!ctx) return true

  try {
    ctx.drawImage(canvas, 0, 0, 32, 32)
    const { data } = ctx.getImageData(0, 0, 32, 32)
    const r = data[0]
    const g = data[1]
    const b = data[2]
    for (let i = 4; i < data.length; i += 4) {
      if (data[i] !== r || data[i + 1] !== g || data[i + 2] !== b) return true
    }
    return false
  } catch {
    // A tainted or zero-sized canvas throws; treat it as not ready rather than
    // failing the whole capture on the first poll.
    return false
  }
}

/**
 * Wait for a live, drawn canvas in `mode`.
 *
 * Mounting a stage is not enough: React has to commit, R3F has to build the
 * context, and for the in-camera stage the gather pass has to run before the
 * image means anything. `isConnected` rejects a canvas that has been detached
 * by a view change but not yet unregistered.
 */
async function awaitStage(mode: StageMode, frames = 240): Promise<HTMLCanvasElement | null> {
  for (let i = 0; i < frames; i++) {
    const canvas = canvases.get(mode)
    if (canvas && canvas.isConnected && canvas.width > 1 && canvas.height > 1 && hasDrawn(canvas)) {
      // One more frame: the first drawn frame of a freshly mounted in-camera
      // stage can be the scene before the gather has run, which would show an
      // unblurred image and quietly misrepresent the optics.
      await raf()
      const settled = canvases.get(mode)
      return settled?.isConnected ? settled : canvas
    }
    await raf()
  }
  return null
}

/** Downscale to keep a snapshot affordable as base64 in a chat transcript. */
function toScaledPng(source: HTMLCanvasElement): { base64: string; width: number; height: number } {
  const scale = Math.min(1, MAX_EDGE / Math.max(source.width, source.height))
  const width = Math.max(1, Math.round(source.width * scale))
  const height = Math.max(1, Math.round(source.height * scale))

  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('no 2d context for snapshot scaling')
  ctx.drawImage(source, 0, 0, width, height)

  return { base64: out.toDataURL('image/png').split(',')[1] ?? '', width, height }
}

export interface StageSnapshot {
  readonly base64: string
  readonly width: number
  readonly height: number
  /** The view the app was left in, since capturing may have had to change it. */
  readonly view: ViewMode
}

/**
 * Photograph one of the two stages.
 *
 * If that stage is not currently on screen this switches to the split view to
 * bring it up, and leaves it there. Switching back afterwards was the first
 * instinct and it is wrong twice over: the user would see a flash of a view
 * they did not ask for, and an assistant that looks at the in-camera image
 * should leave it visible so the human can see what it saw.
 *
 * Requires `preserveDrawingBuffer` on the WebGL context. Without it the buffer
 * is already cleared by the time a tool handler runs and every capture comes
 * back transparent.
 */
export async function captureStage(mode: StageMode): Promise<StageSnapshot> {
  if (!canvases.has(mode)) {
    useSimStore.getState().setView('split')
  }

  const canvas = await awaitStage(mode)
  if (!canvas) {
    throw new Error(`the ${mode} view did not come up in time to be captured`)
  }

  return { ...toScaledPng(canvas), view: useSimStore.getState().view }
}
