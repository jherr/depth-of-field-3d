import { useState } from 'react'
import { Group } from './controls.tsx'

/**
 * What this simulator does not model.
 *
 * Shipped in the UI rather than buried in a comment on purpose. The tool asks
 * photographers to trust its numbers, so it owes them a clear account of where
 * the model stops -- otherwise the first artifact someone notices reads as a
 * bug in the physics rather than a known boundary of the approximation.
 */

const APPROXIMATIONS: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: 'Partial occlusion is approximated',
    body: 'Background revealed behind a blurred foreground edge is the adjacent visible background stretched inward, not the geometry that is genuinely hidden. Only depth peeling or true ray-traced aperture sampling fixes this.',
  },
  {
    title: 'Occluded highlights contribute nothing',
    body: 'A bright bulb just behind a foreground edge should still cast part of its blur disc into view. A single-layer depth buffer has no record that it exists.',
  },
  {
    title: 'Large discs are undersampled',
    body: 'The gather takes a fixed number of taps, so a small very bright source spread over a large disc is hit by only a few of them. That is the speckle you can see on the edges of big highlights.',
  },
  {
    title: 'Blur is clamped at a maximum radius',
    body: 'At very wide apertures and close focus the true blur on a distant wall runs to hundreds of pixels. When the ceiling is hit, the photograph becomes less blurred than the numbers claim — and the HUD says so rather than hiding it.',
  },
  {
    title: 'The focus transition has one tuned constant',
    body: 'Blur below about two pixels is faded in from the sharp image, so the plane of focus is never sourced from the half-resolution buffer. That fade width is the only number in the pipeline chosen by eye rather than derived.',
  },
  {
    title: 'No transparency',
    body: 'The depth buffer records whatever sits behind glass, not the glass, so transparent surfaces cannot be blurred correctly. The scene has none, and the type system forbids adding any.',
  },
]

const LENS_SIMPLIFICATIONS: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: 'Symmetric lens',
    body: 'Pupil magnification is assumed to be 1. The asymmetry correction only matters at macro magnifications.',
  },
  {
    title: 'No focus breathing',
    body: 'Internally focusing lenses shorten as they focus close. Focal length here is fixed at its marked value.',
  },
  {
    title: 'f-stops, not T-stops',
    body: 'Transmission losses through the glass are not modelled, so exposure is geometric only.',
  },
  {
    title: 'No aberrations',
    body: 'Field curvature, longitudinal chromatic aberration and spherical aberration are all absent. In particular, spherical aberration is what gives real bokeh its "good" or "bad" character — soft-edged versus bright-rimmed discs.',
  },
  {
    title: 'No mechanical vignetting',
    body: 'Off-axis highlights on a real lens are clipped by the barrel into cat’s-eye shapes. Here every disc keeps the full aperture polygon wherever it lands in the frame.',
  },
  {
    title: 'Focus measured from the lens',
    body: 'Distances are measured from the optical centre, which is where the render camera sits — that is what makes the picture correct. Lens focus scales are engraved from the image plane instead, so the panel above shows both.',
  },
]

export function LimitationsPanel() {
  const [open, setOpen] = useState(false)

  return (
    <Group title="What this does not model">
      <button
        type="button"
        className="sim-btn"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Hide' : 'Show'} approximations
      </button>

      {open && (
        <div style={{ marginTop: '0.6rem' }}>
          <div className="sim-group-title">Rendering</div>
          {APPROXIMATIONS.map((a) => (
            <p key={a.title} className="sim-hint" style={{ marginBottom: '0.45rem' }}>
              <strong>{a.title}.</strong> {a.body}
            </p>
          ))}
          <div className="sim-group-title" style={{ marginTop: '0.6rem' }}>
            Optics
          </div>
          {LENS_SIMPLIFICATIONS.map((a) => (
            <p key={a.title} className="sim-hint" style={{ marginBottom: '0.45rem' }}>
              <strong>{a.title}.</strong> {a.body}
            </p>
          ))}
          <p className="sim-hint" style={{ marginTop: '0.6rem' }}>
            Everything above is a limitation of the <em>rendering</em>. The depth-of-field numbers
            themselves are exact closed-form thin-lens optics, and the shader's blur radius is
            checked against them at runtime — see the CoC probe in the Render panel.
          </p>
        </div>
      )}
    </Group>
  )
}
