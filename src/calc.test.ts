import { describe, expect, it } from 'vitest'
import {
  calculatePerformance,
  getBudgetStatus,
  getQuality,
  isPoiVisible,
  pickLod,
} from './calc'
import { createDefaultProject } from './data'

describe('performance calculation', () => {
  it('selects LOD using the active quality scale', () => {
    const state = createDefaultProject()
    const template = state.objectTemplates.find((item) => item.type === 'tree')!

    expect(pickLod(template, 30, 1).level).toBe(1)
    expect(pickLod(template, 30, 2).level).toBe(0)
  })

  it('applies HLOD percentages after the switch distance', () => {
    const state = createDefaultProject()
    state.objectTemplates = state.objectTemplates.map((template) =>
      template.type === 'tree' ? { ...template, disappearDistance: 0 } : template,
    )
    state.pois = [
      {
        id: 'near',
        name: 'Near',
        description: '',
        level: 'M',
        x: 500,
        y: 600,
        width: 40,
        height: 40,
        cullingRate: 0,
        objects: { meadow: 0, tree: 10, building: 0, prop: 0, effect: 0 },
      },
      {
        id: 'far',
        name: 'Far',
        description: '',
        level: 'M',
        x: 500,
        y: 420,
        width: 40,
        height: 40,
        cullingRate: 0,
        objects: { meadow: 0, tree: 10, building: 0, prop: 0, effect: 0 },
      },
    ]
    state.camera = { x: 520, y: 720, heading: -90, fov: 80, viewDistance: 700, near: 1, far: 800 }

    const result = calculatePerformance(state)
    const near = result.byPoi.find((poi) => poi.poiId === 'near')!
    const far = result.byPoi.find((poi) => poi.poiId === 'far')!

    expect(near.dp).toBeGreaterThan(far.dp)
    expect(far.dp).toBeGreaterThan(0)
  })

  it('reduces contribution by POI occlusion rate', () => {
    const state = createDefaultProject()
    state.pois = [
      {
        id: 'open',
        name: 'Open',
        description: '',
        level: 'M',
        x: 490,
        y: 500,
        width: 60,
        height: 60,
        cullingRate: 0,
        objects: { meadow: 0, tree: 10, building: 0, prop: 0, effect: 0 },
      },
      {
        id: 'blocked',
        name: 'Blocked',
        description: '',
        level: 'M',
        x: 570,
        y: 500,
        width: 60,
        height: 60,
        cullingRate: 50,
        objects: { meadow: 0, tree: 10, building: 0, prop: 0, effect: 0 },
      },
    ]
    state.camera = { x: 520, y: 720, heading: -90, fov: 90, viewDistance: 500, near: 1, far: 600 }

    const result = calculatePerformance(state)
    const open = result.byPoi.find((poi) => poi.poiId === 'open')!
    const blocked = result.byPoi.find((poi) => poi.poiId === 'blocked')!

    expect(blocked.dp).toBeLessThan(open.dp)
  })

  it('detects frustum visibility and budget status thresholds', () => {
    const state = createDefaultProject()
    const quality = getQuality(state)
    expect(quality.level).toBe(3)
    expect(isPoiVisible(state.pois[0], state.camera)).toBe(true)
    expect(getBudgetStatus(0.2, 0.4)).toBe('safe')
    expect(getBudgetStatus(0.7, 0.4)).toBe('warning')
    expect(getBudgetStatus(0.2, 0.9)).toBe('critical')
  })
})

