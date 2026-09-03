/**
 * Final pass: recombine, tone map, encode.
 *
 * Tone mapping and the sRGB transfer function are applied here and ONLY here.
 * Every intermediate target is linear half-float, because blurring
 * gamma-encoded values produces dark halos and mushy highlights -- the single
 * most common reason hand-rolled bokeh looks wrong.
 *
 * Written out by hand rather than using three's `colorspace_fragment` chunk so
 * there is no hidden dependency on three injecting the right defines into a
 * custom ShaderMaterial.
 */
export const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tCoc;
uniform sampler2D tFar;
uniform sampler2D tNear;
uniform vec2 uTexelHalf;
uniform float uBlurEnabled;
uniform float uExposure;
/** 0 off, 1 linear depth, 2 signed CoC, 3 near coverage. */
uniform int uDebugMode;
uniform float uMaxCocPx;

varying vec2 vUv;

/**
 * Upsample from the half-resolution gather buffers.
 *
 * A plain hardware bilinear fetch, deliberately. An earlier version averaged a
 * 3x3 neighbourhood here, which is a four-pixel-wide blur applied to the entire
 * image -- it rounded the corners straight off the aperture polygon and undid
 * the whole point of modelling blade count. The GPU's own bilinear filter is
 * the correct amount of interpolation, and depth-edge bleeding is already
 * handled upstream by the gather's reach test.
 */
vec4 upsample(sampler2D tex, vec2 uv) {
  return texture2D(tex, uv);
}

// AgX-style tonemap: a filmic curve that keeps very bright highlights from
// clipping to flat white, which matters because the bokeh sources in this
// scene are deliberately far above 1.0.
vec3 toneMap(vec3 x) {
  x = max(vec3(0.0), x);
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

vec3 linearToSrgb(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(max(c, vec3(1e-5)), vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}

void main() {
  vec3 sharp = texture2D(tScene, vUv).rgb;
  float signedRadius = texture2D(tCoc, vUv).r;

  if (uDebugMode == 2) {
    float n = clamp(signedRadius / max(uMaxCocPx, 1.0), -1.0, 1.0);
    // Blue in front of focus, red behind, black at the plane of focus.
    gl_FragColor = vec4(max(n, 0.0), 0.0, max(-n, 0.0), 1.0);
    return;
  }
  if (uDebugMode == 3) {
    float a = upsample(tNear, vUv).a;
    gl_FragColor = vec4(a, a, a, 1.0);
    return;
  }

  vec3 colour = sharp;

  if (uBlurEnabled > 0.5) {
    float radius = abs(signedRadius);
    // The plane of focus must never be sourced from the half-resolution
    // buffer: half-res softness right where the image should be at its
    // sharpest is the first thing a photographer would notice.
    float blendFar = smoothstep(0.5, 2.0, radius);
    vec3 far = upsample(tFar, vUv).rgb;
    colour = mix(sharp, far, blendFar);

    vec4 near = upsample(tNear, vUv);
    // Premultiplied, so the foreground composites over whatever is behind it.
    colour = colour * (1.0 - near.a) + near.rgb;
  }

  colour *= uExposure;
  gl_FragColor = vec4(linearToSrgb(toneMap(colour)), 1.0);
}
`

/** Linear-depth debug view, for confirming the depth reconstruction. */
export const DEPTH_DEBUG_FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tDepth;
uniform float cameraNear;
uniform float cameraFar;
uniform float uRangeM;
varying vec2 vUv;

void main() {
  float d = texture2D(tDepth, vUv).x;
  float m = -perspectiveDepthToViewZ(d, cameraNear, cameraFar);
  float t = clamp(m / uRangeM, 0.0, 1.0);
  // Banded, so absolute distances are readable rather than just relative.
  float band = fract(m * 2.0) > 0.5 ? 1.0 : 0.82;
  gl_FragColor = vec4(vec3(t, 1.0 - t, 0.35) * band, 1.0);
}
`
