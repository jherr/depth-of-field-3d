import { useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { encodeCocCriterion } from '#/lib/optics/params.ts'
import { DEFAULT_SCENE } from '#/lib/scene/defaultScene.ts'
import { encodeLayout } from '#/lib/scene/layout.ts'
import type { SimSearch } from './searchSchema.ts'
import { useSimStore } from './useSimStore.ts'

const DEBOUNCE_MS = 200

/**
 * Mirrors the store into the URL so any state is shareable.
 *
 * One direction only, and debounced. Every write uses `replace: true`, so
 * dragging a slider does not fill the history stack -- which is the behaviour
 * you want, since nobody expects Back to undo a single slider tick.
 */
export function useUrlWriteThrough(): void {
  const navigate = useNavigate()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const write = (): void => {
      const { optics, layout, view, units } = useSimStore.getState()
      // Written out field by field rather than spread from a Record, so the
      // router can type-check the search shape against the route.
      const search: SimSearch = {
        lens: optics.lensId,
        f: optics.focalLengthMm,
        N: optics.fNumber,
        s: optics.focusDistanceM,
        sensor: optics.sensorId,
        coc: encodeCocCriterion(optics.cocCriterion),
        diff: optics.diffraction ? 1 : 0,
        view,
        units,
        layout: encodeLayout(DEFAULT_SCENE, layout),
      }
      void navigate({ to: '/', search, replace: true, resetScroll: false })
    }

    const unsubscribe = useSimStore.subscribe(() => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(write, DEBOUNCE_MS)
    })

    return () => {
      if (timer.current) clearTimeout(timer.current)
      unsubscribe()
    }
  }, [navigate])
}
