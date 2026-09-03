import { describe, expect, it } from 'vitest'
import {
  formatDistance,
  formatFNumber,
  formatFocalLength,
  formatMm,
  formatStopsDifference,
} from '#/lib/optics/format.ts'

describe('formatDistance', () => {
  it('renders infinity as a symbol, in both unit systems', () => {
    expect(formatDistance(Infinity, 'metric')).toBe('∞')
    expect(formatDistance(Infinity, 'imperial')).toBe('∞')
  })

  it('uses centimetres below a metre', () => {
    expect(formatDistance(0.45, 'metric')).toBe('45 cm')
    expect(formatDistance(0.085, 'metric')).toBe('8.5 cm')
  })

  it('shrinks precision as distance grows', () => {
    expect(formatDistance(2.7295, 'metric')).toBe('2.73 m')
    expect(formatDistance(29.8119, 'metric')).toBe('29.8 m')
    expect(formatDistance(476.39, 'metric')).toBe('476 m')
  })

  it('uses inches below a foot and feet above it', () => {
    expect(formatDistance(0.2, 'imperial')).toBe('7.9 in')
    expect(formatDistance(2.7295, 'imperial')).toBe('8.96 ft')
    expect(formatDistance(29.8119, 'imperial')).toBe('97.8 ft')
  })

  it('handles non-finite and negative input without producing NaN text', () => {
    for (const v of [NaN, -1, -Infinity]) {
      for (const u of ['metric', 'imperial'] as const) {
        expect(formatDistance(v, u)).not.toContain('NaN')
      }
    }
  })

  it('never renders a value that reads as zero for a real distance', () => {
    expect(formatDistance(0.0004, 'metric')).not.toBe('0 cm')
  })
})

describe('formatFNumber', () => {
  it('drops the trailing zero on whole stops', () => {
    expect(formatFNumber(8)).toBe('f/8')
    expect(formatFNumber(2)).toBe('f/2')
  })

  it('keeps one decimal on fractional stops', () => {
    expect(formatFNumber(1.4)).toBe('f/1.4')
    expect(formatFNumber(2.8)).toBe('f/2.8')
    expect(formatFNumber(6.3)).toBe('f/6.3')
  })
})

describe('formatFocalLength', () => {
  it('is always whole millimetres', () => {
    expect(formatFocalLength(50)).toBe('50mm')
    expect(formatFocalLength(23.9)).toBe('24mm')
  })
})

describe('formatMm', () => {
  it('shows enough decimals to distinguish CoC values', () => {
    expect(formatMm(0.03)).toBe('0.030 mm')
    expect(formatMm(0.0288)).toBe('0.029 mm')
  })
})

describe('formatStopsDifference', () => {
  it('reports how far a lens is stopped down from wide open', () => {
    expect(formatStopsDifference(2.8, 2.8)).toBe('wide open')
    expect(formatStopsDifference(5.6, 2.8)).toBe('+2 stops')
    expect(formatStopsDifference(4, 2.8)).toBe('+1 stop')
  })
})
