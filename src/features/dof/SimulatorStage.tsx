import type { DerivedOptics } from './state/derive.ts'
import type { Size } from './state/useElementSize.ts'
import { SimulatorCanvas } from './SimulatorCanvas.tsx'

export function SimulatorStage({
  derived,
  size,
  mode,
}: {
  derived: DerivedOptics
  size: Size
  mode: 'thirdPerson' | 'inCamera'
}) {
  return <SimulatorCanvas derived={derived} size={size} mode={mode} />
}
