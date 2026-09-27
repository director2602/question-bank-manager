import { describe, it, expect } from 'vitest'
import { renderDiagramSvg } from '@/lib/pdf/diagramSvgRenderer'
import type { DiagramShape } from '@/lib/ai/ocrProvider'

// This renderer is deliberately plain, deterministic code — it draws
// EXACTLY the shapes it's given, never anything AI-derived at this layer
// (see the file's own comment). These tests lock down that the shape →
// SVG mapping stays correct and coordinates stay clamped to the fixed
// 0-1000 canvas, since a diagram whose numbers drift off-canvas would
// silently corrupt an otherwise-correct extraction.

describe('renderDiagramSvg', () => {
  it('renders an empty shape list as a valid, blank SVG', () => {
    const svg = renderDiagramSvg([])
    expect(svg).toContain('<svg')
    expect(svg).toContain('viewBox="0 0 1000 1000"')
  })

  it('renders a line as an <line> element with the given coordinates', () => {
    const shapes: DiagramShape[] = [{ type: 'line', x1: 10, y1: 20, x2: 300, y2: 400 }]
    const svg = renderDiagramSvg(shapes)
    expect(svg).toContain('<line x1="10" y1="20" x2="300" y2="400"')
  })

  it('adds an arrowhead marker reference only when arrow is true', () => {
    const withArrow = renderDiagramSvg([{ type: 'line', x1: 0, y1: 0, x2: 100, y2: 100, arrow: true }])
    const withoutArrow = renderDiagramSvg([{ type: 'line', x1: 0, y1: 0, x2: 100, y2: 100 }])
    expect(withArrow).toContain('marker-end="url(#arrowhead)"')
    expect(withoutArrow).not.toContain('marker-end')
  })

  it('renders a circle with fill="none" (outline only, never a filled blob)', () => {
    const svg = renderDiagramSvg([{ type: 'circle', cx: 500, cy: 500, r: 100 }])
    expect(svg).toContain('<circle cx="500" cy="500" r="100"')
    expect(svg).toContain('fill="none"')
  })

  it('renders a closed polygon as <polygon> and an open one as <polyline>', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 100 },
    ]
    const closed = renderDiagramSvg([{ type: 'polygon', points, closed: true }])
    const open = renderDiagramSvg([{ type: 'polygon', points, closed: false }])
    expect(closed).toContain('<polygon')
    expect(open).toContain('<polyline')
  })

  it('drops a polygon with fewer than 2 points instead of emitting broken markup', () => {
    // Note: the SVG always contains one <polygon> for the arrowhead marker
    // in <defs> — assert on the rendered BODY (after </defs>), not the
    // whole document, so that fixed marker definition doesn't mask a bug.
    const svg = renderDiagramSvg([{ type: 'polygon', points: [{ x: 0, y: 0 }] }])
    const body = svg.slice(svg.indexOf('</defs>'))
    expect(body).not.toContain('<polygon')
    expect(body).not.toContain('<polyline')
  })

  it('escapes XML-significant characters in text labels', () => {
    const svg = renderDiagramSvg([{ type: 'text', x: 10, y: 10, text: 'A < B & C > D' }])
    expect(svg).toContain('A &lt; B &amp; C &gt; D')
    expect(svg).not.toContain('A < B & C > D')
  })

  it('clamps out-of-range coordinates to the 0-1000 canvas instead of letting them escape it', () => {
    const svg = renderDiagramSvg([{ type: 'circle', cx: -50, cy: 5000, r: 10 }])
    expect(svg).toContain('cx="0"')
    expect(svg).toContain('cy="1000"')
  })

  it('sizes the outer <svg> from widthPx/heightPx while keeping the viewBox fixed', () => {
    const svg = renderDiagramSvg([], { widthPx: 250, heightPx: 180 })
    expect(svg).toContain('width="250"')
    expect(svg).toContain('height="180"')
    expect(svg).toContain('viewBox="0 0 1000 1000"')
  })
})
