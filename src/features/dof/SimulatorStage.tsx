import type { DerivedOptics } from './state/derive.ts'
import type { Size } from './state/useElementSize.ts'
import { SimulatorCanvas } from './SimulatorCanvas.tsx'

export function SimulatorStage({ derived, size }: { derived: DerivedOptics; size: Size }) {
  return <SimulatorCanvas derived={derived} size={size} />
}
