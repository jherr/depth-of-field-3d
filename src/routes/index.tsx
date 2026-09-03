/**
 * The simulator route.
 *
 * IMPORTANT: every top-level import in this file must be free of three.js and
 * anything else that needs a browser. `ssr: false` stops the *component* from
 * running on the server, and TanStack Start's automatic code splitting puts it
 * in its own chunk -- but this module's other exports (`validateSearch`,
 * `head`) are still evaluated server-side.
 */
import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { Suspense, lazy } from 'react'
import { normalizeSimSearch } from '#/features/dof/state/searchSchema.ts'
import { SimulatorSkeleton } from '#/features/dof/ui/SimulatorSkeleton.tsx'

const Simulator = lazy(() => import('#/features/dof/Simulator.tsx'))

export const Route = createFileRoute('/')({
  ssr: false,
  validateSearch: normalizeSimSearch,
  head: () => ({
    meta: [
      { title: 'Depth of Field — 3D Simulator' },
      {
        name: 'description',
        content:
          'A physically accurate depth of field simulator: see the plane of focus and the in-focus volume in 3D, then look through the lens.',
      },
    ],
  }),
  pendingComponent: SimulatorSkeleton,
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <ClientOnly fallback={<SimulatorSkeleton />}>
      <Suspense fallback={<SimulatorSkeleton />}>
        <Simulator />
      </Suspense>
    </ClientOnly>
  )
}
