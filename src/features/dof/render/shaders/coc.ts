/**
 * Circle-of-confusion pass.
 *
 * Writes the SIGNED blur radius in pixels: negative in front of the plane of
 * focus, positive behind it. Carrying the sign here means the near/far split
 * downstream is free rather than needing a second channel.
 *
 * Every uniform in this shader comes straight from the pure optics module.
 * There is no tuning constant, and the formula is the same thin-lens expression
 * that produces the near and far limits in the HUD -- which is the entire
 * premise of the project.
 */
export const COC_FRAG = /* glsl */ `
#include <packing>

uniform sampler2D tDepth;
uniform float cameraNear;
uniform float cameraFar;

uniform float uFocalMm;
uniform float uFNumber;
uniform float uFocusMm;
/** Pixels per millimetre on the sensor: renderHeightPx / sensorHeightMm. */
uniform float uMmToPx;
uniform float uAiryMm;
uniform float uDiffraction;
uniform float uMaxCocPx;

varying vec2 vUv;

void main() {
  float d = texture2D(tDepth, vUv).x;

  // Axial (perpendicular) view-space depth. Using length(viewPosition) instead
  // would make the in-focus surface a sphere and invent corner softness.
  float viewZ = perspectiveDepthToViewZ(d, cameraNear, cameraFar);
  float zMm = -viewZ * 1000.0;

  // C = f^2 / (N (s - f)) * (z - s) / z   -- a DIAMETER, in mm on the sensor.
  float aperture = (uFocalMm * uFocalMm) / (uFNumber * max(uFocusMm - uFocalMm, 1e-4));
  float geoMm = aperture * (zMm - uFocusMm) / max(zMm, 1e-3);

  // Defocus and diffraction add in quadrature. The sign is taken separately so
  // the Airy floor still applies exactly at the plane of focus, where the
  // geometric term is zero.
  float s = geoMm >= 0.0 ? 1.0 : -1.0;
  float effMm = mix(geoMm, s * sqrt(geoMm * geoMm + uAiryMm * uAiryMm), uDiffraction);

  // Halved: the formula gives a diameter, the gather wants a radius.
  float radiusPx = effMm * uMmToPx * 0.5;

  // G carries linear depth in metres. It costs nothing here and it lets the
  // runtime probe compare the GPU's circle of confusion against the CPU's
  // without needing to know anything about the scene -- which is what makes
  // "the picture agrees with the numbers" a checkable claim.
  gl_FragColor = vec4(clamp(radiusPx, -uMaxCocPx, uMaxCocPx), zMm * 0.001, 0.0, 1.0);
}
`
