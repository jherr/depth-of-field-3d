/**
 * One palette for the depth-of-field annotations, shared by the 3D overlay,
 * the ruler markers and the numeric readout's swatches.
 *
 * Sharing it is the point: the colour marking the plane of focus in the room
 * is the same colour beside the focus distance in the table, so the two read
 * as one idea rather than two coincidences.
 *
 * Hue is always paired with position and lightness rather than relying on
 * red/green contrast, so the annotations stay legible with the common forms of
 * colour vision deficiency.
 */
export const DOF_COLORS = {
  /** The exact-focus surface. Warm and bright: the one plane that is truly sharp. */
  focusPlane: '#ffc94d',
  /** Near and far tolerance boundaries. */
  nearPlane: '#4dc3ff',
  farPlane: '#9d7bff',
  /** The in-focus volume between the limits. */
  slab: '#4dc3ff',
  /** The camera's view pyramid. */
  frustum: '#8fa3b0',
  /** Marks a far limit that runs to infinity. */
  infinite: '#ff7bd0',
} as const
