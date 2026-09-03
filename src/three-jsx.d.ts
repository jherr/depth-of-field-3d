/**
 * React 19 moved the JSX namespace under `React`, so @react-three/fiber's
 * element types are no longer picked up automatically. Without this, every
 * `<mesh>` and `<boxGeometry>` is an unknown intrinsic element.
 *
 * tsconfig pins `types` to `vite/client`, so this augmentation has to be a
 * source file in `include` rather than a `types` entry.
 */
import type { ThreeElements } from '@react-three/fiber'

declare global {
  namespace React {
    namespace JSX {
      interface IntrinsicElements extends ThreeElements {}
    }
  }
}
