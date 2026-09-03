import { useCallback, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { useSimStore } from '#/features/dof/state/useSimStore.ts'
import type { Vec3 } from '#/lib/scene/types.ts'

const UP = new THREE.Vector3(0, 1, 0)
const GRID_SNAP_M = 0.1

export interface DragOnFloorOptions {
  readonly propId: string
  readonly enabled: boolean
  readonly footprintRadiusM: number
  readonly currentPosition: Vec3
}

/**
 * Drag a prop across the floor.
 *
 * Two details do the heavy lifting:
 *
 * - `setPointerCapture` on pointer-down. Without it, the drag dies the moment
 *   the cursor leaves the object's silhouette, which is exactly when you are
 *   moving fastest.
 * - A grab offset, so the object keeps its position relative to the cursor
 *   instead of snapping its origin under the pointer.
 *
 * Positions are written to the store but read back through `getState()` inside
 * the render loop, so a drag re-renders only the handle it started on -- not
 * the 3D tree.
 */
export function useDragOnFloor(o: DragOnFloorOptions) {
  const controls = useThree((s) => s.controls) as { enabled?: boolean } | null
  const grabOffset = useRef(new THREE.Vector3())
  const dragPlane = useRef(new THREE.Plane(UP, 0))
  const hit = useMemo(() => new THREE.Vector3(), [])
  const verticalDrag = useRef(false)
  const startY = useRef(0)

  const onPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!o.enabled) return
      e.stopPropagation()
      ;(e.target as Element | null)?.setPointerCapture?.(e.pointerId)

      const store = useSimStore.getState()
      store.setDragging(o.propId)
      store.setSelected(o.propId)
      if (controls) controls.enabled = false

      verticalDrag.current = e.shiftKey
      startY.current = o.currentPosition[1]

      if (verticalDrag.current) {
        // Shift drags height: use a plane facing the camera through the object.
        const normal = new THREE.Vector3()
        e.camera.getWorldDirection(normal)
        normal.y = 0
        normal.normalize()
        dragPlane.current.setFromNormalAndCoplanarPoint(
          normal,
          new THREE.Vector3(...o.currentPosition),
        )
      } else {
        dragPlane.current.set(UP, -o.currentPosition[1])
      }

      if (e.ray.intersectPlane(dragPlane.current, hit)) {
        grabOffset.current.set(...o.currentPosition).sub(hit)
      } else {
        grabOffset.current.set(0, 0, 0)
      }
    },
    [controls, hit, o.currentPosition, o.enabled, o.propId],
  )

  const onPointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const store = useSimStore.getState()
      if (store.draggingPropId !== o.propId) return
      e.stopPropagation()
      if (!e.ray.intersectPlane(dragPlane.current, hit)) return

      const next = hit.clone().add(grabOffset.current)
      if (verticalDrag.current) {
        // Height only; keep the footprint where it was.
        store.dragPropTo(
          o.propId,
          [o.currentPosition[0], Math.max(0, next.y), o.currentPosition[2]],
          o.footprintRadiusM,
        )
        return
      }

      let x = next.x
      let z = next.z
      if (e.ctrlKey || e.metaKey) {
        x = Math.round(x / GRID_SNAP_M) * GRID_SNAP_M
        z = Math.round(z / GRID_SNAP_M) * GRID_SNAP_M
      }
      store.dragPropTo(o.propId, [x, startY.current, z], o.footprintRadiusM)
    },
    [hit, o.currentPosition, o.footprintRadiusM, o.propId],
  )

  const endDrag = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const store = useSimStore.getState()
      if (store.draggingPropId !== o.propId) return
      e.stopPropagation()
      ;(e.target as Element | null)?.releasePointerCapture?.(e.pointerId)
      store.setDragging(null)
      if (controls) controls.enabled = true
    },
    [controls, o.propId],
  )

  const onPointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!o.enabled) return
      e.stopPropagation()
      useSimStore.getState().setHovered(o.propId)
      document.body.style.cursor = 'grab'
    },
    [o.enabled, o.propId],
  )

  const onPointerOut = useCallback(() => {
    if (!o.enabled) return
    const store = useSimStore.getState()
    if (store.hoveredPropId === o.propId) store.setHovered(null)
    if (store.draggingPropId === null) document.body.style.cursor = ''
  }, [o.enabled, o.propId])

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onPointerOver,
    onPointerOut,
  }
}
