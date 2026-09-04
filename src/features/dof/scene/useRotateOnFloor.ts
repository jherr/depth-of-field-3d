import { useCallback, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { useSimStore } from '#/features/dof/state/useSimStore.ts'
import type { Vec3 } from '#/lib/scene/types.ts'

const UP = new THREE.Vector3(0, 1, 0)
const SNAP_RAD = (15 * Math.PI) / 180

export interface RotateOnFloorOptions {
  readonly propId: string
  readonly enabled: boolean
  readonly currentPosition: Vec3
  readonly currentRotationY: number
}

/**
 * Spin a prop about its vertical axis by dragging the outer ring.
 *
 * The mechanics mirror `useDragOnFloor`: pointer capture so the turn survives
 * the cursor leaving the ring, and a grab offset so the point you grabbed stays
 * under the cursor instead of the prop's heading snapping to the pointer. The
 * offset is the difference between the pointer's bearing around the prop and the
 * prop's current heading, frozen on pointer-down. Ctrl / Cmd snaps to 15
 * degrees, the same modifier the move drag uses to snap to the grid.
 *
 * The heading is read off a horizontal plane at the prop's base rather than the
 * ring mesh, so it stays stable even as the ring rotates with the prop.
 */
export function useRotateOnFloor(o: RotateOnFloorOptions) {
  const controls = useThree((s) => s.controls) as { enabled?: boolean } | null
  const plane = useRef(new THREE.Plane(UP, 0))
  const hit = useMemo(() => new THREE.Vector3(), [])
  const grabOffset = useRef(0)

  // Bearing of a floor point around the prop's centre. atan2(x, z) rather than
  // the usual atan2(z, x) so the angle matches three.js' rotation.y convention.
  const bearing = (p: THREE.Vector3) =>
    Math.atan2(p.x - o.currentPosition[0], p.z - o.currentPosition[2])

  const onPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!o.enabled) return
      e.stopPropagation()
      ;(e.target as Element | null)?.setPointerCapture?.(e.pointerId)

      const store = useSimStore.getState()
      store.setDragging(o.propId)
      store.setSelected(o.propId)
      if (controls) controls.enabled = false

      plane.current.set(UP, -o.currentPosition[1])
      grabOffset.current = e.ray.intersectPlane(plane.current, hit)
        ? bearing(hit) - o.currentRotationY
        : 0
      document.body.style.cursor = 'grabbing'
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [controls, hit, o.currentPosition, o.currentRotationY, o.enabled, o.propId],
  )

  const onPointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const store = useSimStore.getState()
      if (store.draggingPropId !== o.propId) return
      e.stopPropagation()
      if (!e.ray.intersectPlane(plane.current, hit)) return
      let next = bearing(hit) - grabOffset.current
      if (e.ctrlKey || e.metaKey) next = Math.round(next / SNAP_RAD) * SNAP_RAD
      store.rotatePropTo(o.propId, next, o.currentPosition)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hit, o.currentPosition, o.propId],
  )

  const endDrag = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const store = useSimStore.getState()
      if (store.draggingPropId !== o.propId) return
      e.stopPropagation()
      ;(e.target as Element | null)?.releasePointerCapture?.(e.pointerId)
      store.setDragging(null)
      if (controls) controls.enabled = true
      document.body.style.cursor = ''
    },
    [controls, o.propId],
  )

  const onPointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!o.enabled) return
      e.stopPropagation()
      // Keep the prop emphasised so the rings do not blink out as the cursor
      // crosses from the prop body onto the ring.
      useSimStore.getState().setHovered(o.propId)
      if (useSimStore.getState().draggingPropId === null) document.body.style.cursor = 'grab'
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
