import { useMemo } from 'react'
import * as THREE from 'three'
import { Text } from '@react-three/drei'
import { frameHalfExtentsAtDistance } from '#/lib/optics/fov.ts'
import type { FovResult } from '#/lib/optics/fov.ts'
import { formatDistance } from '#/lib/optics/format.ts'
import type { UnitSystem } from '#/lib/optics/format.ts'
import { DOF_COLORS } from './dofColors.ts'

/**
 * The camera's view pyramid, with the in-focus region drawn as a filled slab.
 *
 * The cross-section is rectangular and matches the sensor's aspect ratio, not a
 * cone and not the canvas aspect. That is the honest shape: the in-focus volume
 * is the region between the near and far limit planes, clipped to a rectangular
 * pyramid, and switching from full frame to Micro Four Thirds visibly changes
 * it from 3:2 to 4:3.
 */

/** Corner rectangle at a distance, as four world-space points. */
function rectAt(fov: FovResult, distanceM: number): THREE.Vector3[] {
  const { halfWidthM: hw, halfHeightM: hh } = frameHalfExtentsAtDistance(fov, distanceM)
  const z = -distanceM
  return [
    new THREE.Vector3(-hw, -hh, z),
    new THREE.Vector3(hw, -hh, z),
    new THREE.Vector3(hw, hh, z),
    new THREE.Vector3(-hw, hh, z),
  ]
}

/**
 * Closed rectangle outline for a `lineLoop`.
 *
 * `<line>` is not usable here -- it collides with the SVG intrinsic element of
 * the same name -- so outlines are line loops, which also means the closing
 * point is implicit. Line distances are computed up front so the dashed
 * infinity marker has something to dash along.
 */
function outlineGeometry(points: THREE.Vector3[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setFromPoints(points)
  g.computeBoundingSphere()
  return g
}

function slabGeometry(near: THREE.Vector3[], far: THREE.Vector3[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  const v: number[] = []
  const push = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void => {
    v.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
  }
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3): void => {
    push(a, b, c)
    push(a, c, d)
  }
  // four sides
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4
    quad(near[i]!, near[j]!, far[j]!, far[i]!)
  }
  // caps
  quad(near[0]!, near[1]!, near[2]!, near[3]!)
  quad(far[3]!, far[2]!, far[1]!, far[0]!)
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
  g.computeVertexNormals()
  return g
}

export function FrustumSlab({
  fov,
  nearLimitM,
  farLimitM,
  focusDistanceM,
  maxDistanceM,
  showFrustum,
  showVolume,
  units,
}: {
  fov: FovResult
  nearLimitM: number
  farLimitM: number
  focusDistanceM: number
  /** Where to clip the drawing, since the far limit is often infinite. */
  maxDistanceM: number
  showFrustum: boolean
  showVolume: boolean
  units: UnitSystem
}) {
  const farIsInfinite = !Number.isFinite(farLimitM)
  const farDrawM = Math.min(farIsInfinite ? maxDistanceM : farLimitM, maxDistanceM)
  const nearDrawM = Math.min(nearLimitM, maxDistanceM)

  const geo = useMemo(() => {
    const nearRect = rectAt(fov, nearDrawM)
    const farRect = rectAt(fov, farDrawM)
    return {
      pyramid: (() => {
        const g = new THREE.BufferGeometry()
        const apex = new THREE.Vector3(0, 0, 0)
        const edge = rectAt(fov, maxDistanceM)
        const pts: THREE.Vector3[] = []
        for (const c of edge) {
          pts.push(apex, c)
        }
        for (let i = 0; i < 4; i++) {
          pts.push(edge[i]!, edge[(i + 1) % 4]!)
        }
        g.setFromPoints(pts)
        return g
      })(),
      slab: farDrawM > nearDrawM ? slabGeometry(nearRect, farRect) : null,
      nearOutline: outlineGeometry(nearRect),
      farOutline: outlineGeometry(farRect),
      focusOutline:
        focusDistanceM <= maxDistanceM ? outlineGeometry(rectAt(fov, focusDistanceM)) : null,
    }
  }, [fov, nearDrawM, farDrawM, focusDistanceM, maxDistanceM])

  const labelExtents = frameHalfExtentsAtDistance(fov, focusDistanceM)

  return (
    <group>
      {showFrustum && (
        <lineSegments geometry={geo.pyramid}>
          <lineBasicMaterial
            color={DOF_COLORS.frustum}
            transparent
            opacity={0.4}
            toneMapped={false}
          />
        </lineSegments>
      )}

      {showVolume && geo.slab && (
        <mesh geometry={geo.slab} renderOrder={10}>
          {/*
            depthWrite off and double-sided at low opacity: the volume reads as
            a region you can see through rather than a solid object, without
            needing an order-independent-transparency pass.
          */}
          <meshBasicMaterial
            color={farIsInfinite ? DOF_COLORS.infinite : DOF_COLORS.slab}
            transparent
            opacity={0.11}
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
      )}

      <lineLoop geometry={geo.nearOutline} renderOrder={11}>
        <lineBasicMaterial color={DOF_COLORS.nearPlane} toneMapped={false} />
      </lineLoop>

      {/*
        A far limit at infinity is drawn dashed. It must be impossible to
        mistake "sharp to infinity" for "sharp to some distant plane".
      */}
      <lineLoop
        geometry={geo.farOutline}
        renderOrder={11}
        onUpdate={(self) => self.computeLineDistances()}
      >
        {farIsInfinite ? (
          <lineDashedMaterial
            color={DOF_COLORS.infinite}
            dashSize={0.14}
            gapSize={0.1}
            toneMapped={false}
          />
        ) : (
          <lineBasicMaterial color={DOF_COLORS.farPlane} toneMapped={false} />
        )}
      </lineLoop>

      {geo.focusOutline && (
        <lineLoop geometry={geo.focusOutline} renderOrder={12}>
          <lineBasicMaterial color={DOF_COLORS.focusPlane} toneMapped={false} />
        </lineLoop>
      )}

      {focusDistanceM <= maxDistanceM && (
        <Text
          position={[labelExtents.halfWidthM + 0.12, labelExtents.halfHeightM, -focusDistanceM]}
          fontSize={0.12}
          color={DOF_COLORS.focusPlane}
          anchorX="left"
          anchorY="middle"
          outlineWidth={0.006}
          outlineColor="#000000"
        >
          {formatDistance(focusDistanceM, units)}
        </Text>
      )}

      {farIsInfinite && (
        <Text
          position={[
            frameHalfExtentsAtDistance(fov, farDrawM).halfWidthM + 0.12,
            0,
            -farDrawM,
          ]}
          fontSize={0.14}
          color={DOF_COLORS.infinite}
          anchorX="left"
          anchorY="middle"
          outlineWidth={0.006}
          outlineColor="#000000"
        >
          → ∞
        </Text>
      )}
    </group>
  )
}
