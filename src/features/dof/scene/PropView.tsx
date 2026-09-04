import { Suspense } from 'react'
import type { SceneProp } from '#/lib/scene/types.ts'
import type { UnitSystem } from '#/lib/optics/format.ts'
import { DepthRuler } from './props/DepthRuler.tsx'
import { FocusChart } from './props/FocusChart.tsx'
import { Mannequin } from './props/Mannequin.tsx'
import { Box, Cylinder, Sphere, useStandardMaterial } from './props/Primitives.tsx'
import { TripodCamera } from './props/TripodCamera.tsx'
import { GltfProp } from './GltfProp.tsx'

export interface DofBandInfo {
  readonly nearLimitM: number
  readonly farLimitM: number
  readonly focusDistanceM: number
  readonly units: UnitSystem
}

/**
 * The only place in the app that knows how a prop is actually built.
 *
 * Optics, views, controls and the drag handler all deal in `SceneProp` and
 * never look at `geometry`, so swapping a procedural prop for a loaded model is
 * a one-line change to the scene data and touches nothing else.
 */
export function PropView({ prop, band }: { prop: SceneProp; band: DofBandInfo }) {
  const material = useStandardMaterial(prop.material)

  if (prop.geometry.kind === 'gltf') {
    return (
      <Suspense fallback={null}>
        <GltfProp geometry={prop.geometry} material={material} />
      </Suspense>
    )
  }

  const shape = prop.geometry.shape
  switch (shape.type) {
    case 'box':
      return <Box size={shape.size} material={material} />
    case 'cylinder':
      return <Cylinder radius={shape.radius} height={shape.height} material={material} />
    case 'sphere':
      return <Sphere radius={shape.radius} material={material} />
    case 'mannequin':
      return <Mannequin heightM={shape.heightM} material={material} />
    case 'tripodCamera':
      return <TripodCamera columnHeightM={shape.columnHeightM} material={material} />
    case 'focusChart':
      return (
        <FocusChart
          widthM={shape.widthM}
          heightM={shape.heightM}
          tiltDeg={shape.tiltDeg}
          pattern={shape.pattern}
          standMaterial={material}
        />
      )
    case 'depthRuler':
      return (
        <DepthRuler
          lengthM={shape.lengthM}
          tickSpacingM={shape.tickSpacingM}
          nearLimitM={band.nearLimitM}
          farLimitM={band.farLimitM}
          focusDistanceM={band.focusDistanceM}
          units={band.units}
        />
      )
  }
}
