/** Box-filtered colour at half resolution, in linear light. */
export const DOWNSAMPLE_COLOR_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform vec2 uTexelFull;
varying vec2 vUv;

void main() {
  vec3 c = texture2D(tColor, vUv + vec2(-0.5, -0.5) * uTexelFull).rgb;
  c += texture2D(tColor, vUv + vec2(0.5, -0.5) * uTexelFull).rgb;
  c += texture2D(tColor, vUv + vec2(-0.5, 0.5) * uTexelFull).rgb;
  c += texture2D(tColor, vUv + vec2(0.5, 0.5) * uTexelFull).rgb;
  gl_FragColor = vec4(c * 0.25, 1.0);
}
`

/**
 * Half-resolution circle of confusion, kept conservative on both sides:
 * R = the most negative radius (strongest foreground) and G = the largest
 * positive one (strongest background).
 *
 * Averaging instead would let blur vanish on thin features -- a wire or a
 * railing would go sharp against a blurred background.
 */
export const DOWNSAMPLE_COC_FRAG = /* glsl */ `
uniform sampler2D tCoc;
uniform vec2 uTexelFull;
varying vec2 vUv;

void main() {
  float a = texture2D(tCoc, vUv + vec2(-0.5, -0.5) * uTexelFull).r;
  float b = texture2D(tCoc, vUv + vec2(0.5, -0.5) * uTexelFull).r;
  float c = texture2D(tCoc, vUv + vec2(-0.5, 0.5) * uTexelFull).r;
  float d = texture2D(tCoc, vUv + vec2(0.5, 0.5) * uTexelFull).r;
  float nearest = min(min(a, b), min(c, d));
  float farthest = max(max(a, b), max(c, d));
  gl_FragColor = vec4(nearest, farthest, 0.0, 1.0);
}
`

/**
 * Separable max-filter over the near-field radius.
 *
 * This is the fix for foreground bleeding. A gather can only pull colour from
 * texels that already carry a near-field radius, so without dilation a blurred
 * foreground stops dead at its own silhouette and never spreads over the
 * background behind it. Growing the radius outward gives the gather somewhere
 * to spread into.
 */
export const DILATE_NEAR_FRAG = /* glsl */ `
uniform sampler2D tSource;
/** Set true on the first pass, where the near radius must be extracted. */
uniform float uFromCoc;
uniform vec2 uDirection;
uniform float uRadiusPx;
varying vec2 vUv;

const int TAPS = 8;

float sampleNear(vec2 uv) {
  vec2 v = texture2D(tSource, uv).rg;
  return mix(v.r, max(0.0, -v.r), uFromCoc);
}

void main() {
  float m = sampleNear(vUv);
  float step = max(uRadiusPx, 1.0) / float(TAPS);
  for (int i = 1; i <= TAPS; i++) {
    vec2 o = uDirection * step * float(i);
    m = max(m, sampleNear(vUv + o));
    m = max(m, sampleNear(vUv - o));
  }
  gl_FragColor = vec4(m, 0.0, 0.0, 1.0);
}
`
