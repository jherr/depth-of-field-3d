import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `src/lib` is the optics and scene model. It must stay framework-free so the
 * physics can be unit tested with no renderer, no DOM and no React, and so the
 * same numbers can be reused anywhere -- including as a shader's uniforms.
 */

const LIB = resolve(import.meta.dirname, '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [full] : []
  })
}

describe('src/lib is pure', () => {
  const files = sourceFiles(LIB)

  it('contains source files to check', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  it.each(['three', 'react', '@react-three/fiber', '@react-three/drei', 'zustand'])(
    'never imports %s',
    (pkg) => {
      const offenders = files.filter((f) => {
        const src = readFileSync(f, 'utf8')
        return src.includes(`from '${pkg}'`) || src.includes(`from "${pkg}"`)
      })
      expect(offenders).toEqual([])
    },
  )

  it('never touches the DOM or browser globals', () => {
    for (const f of files) {
      expect(readFileSync(f, 'utf8')).not.toMatch(/\bdocument\.|\bwindow\.|localStorage/)
    }
  })
})
