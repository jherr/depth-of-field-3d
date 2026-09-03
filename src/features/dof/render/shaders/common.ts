/** Every pass is a full-screen quad, so they all share this vertex shader. */
export const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

/** Maximum kernel taps. GLSL needs a compile-time bound on the array. */
export const MAX_KERNEL_SAMPLES = 64
