/** Keyboard shortcuts, kept next to the controls they affect. */
export function ShortcutsHint() {
  return (
    <p className="sim-hint" style={{ padding: '0 0.2rem 0.4rem' }}>
      <strong>V</strong> cycles views · <strong>1</strong> / <strong>2</strong> / <strong>3</strong>{' '}
      pick one · <strong>B</strong> toggles blur · drag to orbit · scroll to zoom · drag an object to
      move it,
      <strong> Shift</strong> to raise, <strong>Ctrl</strong> to snap · drag its outer ring to turn.
    </p>
  )
}
