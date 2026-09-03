import { MAX_KERNEL_SAMPLES } from './common.ts'

/**
 * Bokeh gather.
 *
 * Two weight terms, both physical rather than tuned:
 *
 * 1. `w = clamp((rSample - dist) + 1, 0, 1)` -- a sample only contributes if
 *    ITS OWN blur disc is big enough to reach this pixel. That asymmetry is
 *    what stops a sharp background smearing outward while still letting a
 *    blurred one spread over something sharper. A plain Gaussian gets this
 *    wrong in both directions.
 *
 * 2. `w /= (pi * rSample^2 + 1)` -- scatter energy normalisation. A point
 *    spreads its light over the area of its disc, so it contributes
 *    proportionally less per pixel as the disc grows. This is why a strongly
 *    defocused highlight becomes large and DIM rather than large and bright,
 *    and it is not a fudge factor.
 *
 * The near-field variant accumulates premultiplied colour and reports coverage
 * in alpha. In the dilated halo outside a foreground silhouette that alpha is
 * fractional, which is how the foreground composites softly over the
 * background -- an approximation of partial occlusion, not a solution to it.
 */
export const GATHER_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tCoc;
uniform sampler2D tNearRadius;
uniform vec2 uTexel;
uniform vec2 uKernel[${MAX_KERNEL_SAMPLES}];
uniform int uSamples;
uniform float uRotation;
/** 1.0 for the near field, 0.0 for the far field. */
uniform float uNearField;

uniform float uBlades;
uniform float uRoundness;
uniform float uBladeRotation;

/**
 * Radius of the aperture opening in direction theta, as a fraction of the
 * blur radius.
 *
 * This is what actually gives a highlight its shape, and it is easy to get
 * wrong. In a GATHER, a pixel receives light from a defocused point if it lies
 * inside that point's blur disc -- so the disc's silhouette is decided by the
 * reach test, NOT by where the kernel places its taps. Testing Euclidean
 * distance produces a perfectly round highlight no matter how many blades the
 * lens has. Testing against the aperture polygon is what makes an eight-bladed
 * lens render octagonal bokeh.
 *
 * Physically this is the same statement as before: the point-spread function
 * is the indicator function of the exit pupil, so "inside the disc" has to mean
 * "inside the scaled pupil".
 */
float apertureBound(float theta) {
  if (uBlades < 3.0) return 1.0;
  float step = 6.2831853 / uBlades;
  float halfStep = step * 0.5;
  float local = mod(theta - uBladeRotation, step);
  float poly = cos(halfStep) / cos(local - halfStep);
  return mix(poly, 1.0, uRoundness);
}

varying vec2 vUv;

const float PI = 3.14159265359;

float radiusAt(vec2 uv) {
  vec2 c = texture2D(tCoc, uv).rg;
  return mix(max(c.g, 0.0), max(-c.r, 0.0), uNearField);
}

void main() {
  float centreRadius = mix(radiusAt(vUv), texture2D(tNearRadius, vUv).r, uNearField);

  if (centreRadius < 0.5) {
    vec3 c = texture2D(tColor, vUv).rgb;
    // Far field passes the sharp colour straight through; the near field
    // reports zero coverage so the composite leaves the pixel alone.
    gl_FragColor = mix(vec4(c, 1.0), vec4(0.0), uNearField);
    return;
  }

  // Per-pixel kernel rotation. Turns the K-fold structure of an undersampled
  // disc into noise, which reads far better than banding.
  float jitter = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
  float a = uRotation + jitter * 6.2831853;
  float ca = cos(a);
  float sa = sin(a);
  mat2 rot = mat2(ca, -sa, sa, ca);

  vec3 acc = vec3(0.0);
  float wSum = 0.0;
  float coverage = 0.0;
  float coverageSum = 0.0;

  for (int i = 0; i < ${MAX_KERNEL_SAMPLES}; i++) {
    if (i >= uSamples) break;

    vec2 offset = rot * uKernel[i] * centreRadius;
    vec2 sampleUv = vUv + offset * uTexel;
    float dist = length(offset);
    float rSample = radiusAt(sampleUv);

    // How far this sample's own disc extends in the direction of this pixel.
    float bound = apertureBound(atan(offset.y, offset.x));
    float reach = clamp((rSample * bound - dist) * 2.0 + 0.5, 0.0, 1.0);
    float w = reach / (PI * rSample * rSample + 1.0);

    acc += texture2D(tColor, sampleUv).rgb * w;
    wSum += w;
    coverage += reach;
    coverageSum += 1.0;
  }

  if (wSum <= 0.0) {
    vec3 c = texture2D(tColor, vUv).rgb;
    gl_FragColor = mix(vec4(c, 1.0), vec4(0.0), uNearField);
    return;
  }

  vec3 colour = acc / wSum;
  float alpha = mix(1.0, clamp(coverage / max(coverageSum, 1.0), 0.0, 1.0), uNearField);
  gl_FragColor = vec4(colour * mix(1.0, alpha, uNearField), alpha);
}
`

/**
 * Ground-truth gather: one full-resolution pass, no downsampling, no dilation.
 *
 * Slow, and kept permanently. Without a reference implementation there is no
 * way to tell a bug in the fast path from a legitimate limitation of it, so
 * this is what the half-resolution pipeline is diffed against.
 */
export const REFERENCE_GATHER_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tCoc;
uniform vec2 uTexel;
uniform vec2 uKernel[${MAX_KERNEL_SAMPLES}];
uniform int uSamples;
uniform float uRotation;
uniform float uBlades;
uniform float uRoundness;
uniform float uBladeRotation;

varying vec2 vUv;

const float PI = 3.14159265359;

float apertureBound(float theta) {
  if (uBlades < 3.0) return 1.0;
  float step = 6.2831853 / uBlades;
  float halfStep = step * 0.5;
  float local = mod(theta - uBladeRotation, step);
  float poly = cos(halfStep) / cos(local - halfStep);
  return mix(poly, 1.0, uRoundness);
}

void main() {
  float centre = texture2D(tCoc, vUv).r;
  float centreRadius = abs(centre);

  vec3 acc = texture2D(tColor, vUv).rgb * 0.0;
  float wSum = 0.0;

  float jitter = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
  float a = uRotation + jitter * 6.2831853;
  mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));

  // Search radius has to cover the largest disc that could reach this pixel,
  // not just this pixel's own disc, or foreground spread is lost.
  float searchRadius = max(centreRadius, 1.0);

  for (int i = 0; i < ${MAX_KERNEL_SAMPLES}; i++) {
    if (i >= uSamples) break;
    vec2 offset = rot * uKernel[i] * searchRadius;
    vec2 sampleUv = vUv + offset * uTexel;
    float dist = length(offset);
    float rSample = abs(texture2D(tCoc, sampleUv).r);

    float bound = apertureBound(atan(offset.y, offset.x));
    float reach = clamp((rSample * bound - dist) * 2.0 + 0.5, 0.0, 1.0);
    float w = reach / (PI * rSample * rSample + 1.0);
    acc += texture2D(tColor, sampleUv).rgb * w;
    wSum += w;
  }

  gl_FragColor = wSum > 0.0
    ? vec4(acc / wSum, 1.0)
    : vec4(texture2D(tColor, vUv).rgb, 1.0);
}
`
