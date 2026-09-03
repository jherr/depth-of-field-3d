/** Keyboard shortcuts, kept next to the controls they affect. */
export function ShortcutsHint() {
  return (
    <p className="sim-hint" style={{ padding: '0 0.2rem 0.4rem' }}>
      <strong>V</strong> swaps view · <strong>1</strong> / <strong>2</strong> pick one ·{' '}
      <strong>B</strong> toggles blur · drag to orbit · scroll to zoom · drag an object to move it,
      <strong> Shift</strong> to raise, <strong>Ctrl</strong> to snap.
    </p>
  )
}
