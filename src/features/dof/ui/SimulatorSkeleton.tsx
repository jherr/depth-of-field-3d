/**
 * What the server renders.
 *
 * The route sets `ssr: false`, so this is the markup that ships in the initial
 * HTML while the WebGL bundle loads on the client.
 */
export function SimulatorSkeleton() {
  return (
    <div className="sim-shell">
      <header className="sim-topbar">
        <span className="sim-title">Depth of Field</span>
      </header>
      <div className="sim-body">
        <div className="sim-stage">
          <div className="sim-loading">Loading the room…</div>
        </div>
        <aside className="sim-side" />
      </div>
    </div>
  )
}

export default SimulatorSkeleton
