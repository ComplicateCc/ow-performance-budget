import type {
  CameraConfig,
  CategoryStat,
  HeatSample,
  ObjectTemplate,
  ObjectType,
  PerformanceResult,
  PoiRegion,
  PoiStat,
  ProjectState,
  QualityLevel,
  RegionConfig,
} from './types'

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const toRad = (deg: number) => (deg * Math.PI) / 180

export const angleDelta = (a: number, b: number) => {
  let diff = ((a - b + 180) % 360) - 180
  if (diff < -180) diff += 360
  return diff
}

export const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y)

export const getQuality = (state: ProjectState): QualityLevel =>
  state.qualityConfigs[state.platform].find((item) => item.level === state.qualityLevel) ??
  state.qualityConfigs[state.platform][0]

export const getPoiCenter = (poi: PoiRegion) => ({
  x: poi.x + poi.width / 2,
  y: poi.y + poi.height / 2,
})

export const getPoiRadius = (poi: PoiRegion) => Math.hypot(poi.width, poi.height) / 2

export const isPointInCamera = (point: { x: number; y: number }, camera: CameraConfig) => {
  const dist = distance(point, camera)
  if (dist < camera.near || dist > Math.min(camera.viewDistance, camera.far)) return false
  const angle = (Math.atan2(point.y - camera.y, point.x - camera.x) * 180) / Math.PI
  return Math.abs(angleDelta(angle, camera.heading)) <= camera.fov / 2
}

export const isPoiVisible = (poi: PoiRegion, camera: CameraConfig) => {
  const center = getPoiCenter(poi)
  const radius = getPoiRadius(poi)
  const dist = distance(center, camera)
  if (dist - radius > Math.min(camera.viewDistance, camera.far) || dist + radius < camera.near) return false
  const angle = (Math.atan2(center.y - camera.y, center.x - camera.x) * 180) / Math.PI
  const angularTolerance = Math.min(45, (Math.atan2(radius, Math.max(1, dist)) * 180) / Math.PI)
  return Math.abs(angleDelta(angle, camera.heading)) <= camera.fov / 2 + angularTolerance
}

export const pickLod = (template: ObjectTemplate, rawDistance: number, lodScale: number) => {
  const scaledDistance = rawDistance / Math.max(0.1, lodScale)
  const lod = template.lods.find((item) => scaledDistance >= item.start && scaledDistance < item.end)
  return lod ?? template.lods[template.lods.length - 1]
}

export const getTemplateForType = (templates: ObjectTemplate[], type: ObjectType) => {
  const template = templates.find((item) => item.type === type)
  if (!template) throw new Error(`Missing object template for ${type}`)
  return template
}

export const calculatePoiContribution = (
  poi: PoiRegion,
  templates: ObjectTemplate[],
  quality: QualityLevel,
  camera: CameraConfig,
  globalOcclusionRate: number,
) => {
  const center = getPoiCenter(poi)
  const dist = distance(center, camera)
  const occlusion = clamp((poi.occlusionRate || globalOcclusionRate) / 100, 0, 1)
  const result: CategoryStat[] = []

  ;(Object.keys(poi.objects) as ObjectType[]).forEach((type) => {
    const count = poi.objects[type]
    if (!count) return
    const template = poi.templateOverrides?.[type] ?? getTemplateForType(templates, type)
    if (dist > template.disappearDistance * quality.lodScale) return
    const useHlod = dist >= template.hlodDistance * quality.lodScale
    const lod = pickLod(template, dist, quality.lodScale)
    const dpPercent = useHlod ? template.hlodDpPercent : lod.dpPercent
    const triPercent = useHlod ? template.hlodTrianglePercent : lod.trianglePercent
    result.push({
      type,
      count,
      dp: count * template.baseDp * (dpPercent / 100) * (1 - occlusion),
      triangles: count * template.baseTriangles * (triPercent / 100) * (1 - occlusion),
    })
  })

  return result
}

export const getBudgetStatus = (dpRatio: number, triangleRatio: number) => {
  const ratio = Math.max(dpRatio, triangleRatio)
  if (ratio > 0.85) return 'critical'
  if (ratio > 0.6) return 'warning'
  return 'safe'
}

export const calculatePerformance = (state: ProjectState): PerformanceResult => {
  const quality = getQuality(state)
  const camera = {
    ...state.camera,
    viewDistance: Math.min(state.camera.viewDistance, quality.viewDistance),
  }
  const byType = new Map<ObjectType, CategoryStat>()
  const byPoi: PoiStat[] = []
  const visiblePoiIds: string[] = []

  state.pois.forEach((poi) => {
    const visible = isPoiVisible(poi, camera)
    if (!visible) {
      byPoi.push({ poiId: poi.id, name: poi.name, dp: 0, triangles: 0, visible: false })
      return
    }
    visiblePoiIds.push(poi.id)
    const stats = calculatePoiContribution(
      poi,
      state.objectTemplates,
      quality,
      camera,
      state.regionConfig.globalOcclusionRate,
    )
    const poiDp = stats.reduce((sum, item) => sum + item.dp, 0)
    const poiTriangles = stats.reduce((sum, item) => sum + item.triangles, 0)
    byPoi.push({ poiId: poi.id, name: poi.name, dp: poiDp, triangles: poiTriangles, visible: true })

    stats.forEach((item) => {
      const prev = byType.get(item.type) ?? { type: item.type, dp: 0, triangles: 0, count: 0 }
      byType.set(item.type, {
        type: item.type,
        dp: prev.dp + item.dp,
        triangles: prev.triangles + item.triangles,
        count: prev.count + item.count,
      })
    })
  })

  const totalDp = Array.from(byType.values()).reduce((sum, item) => sum + item.dp, 0)
  const totalTriangles = Array.from(byType.values()).reduce((sum, item) => sum + item.triangles, 0)
  const dpBudget = quality.budget.dp
  const triangleBudget = quality.budget.triangles
  const dpRatio = totalDp / dpBudget
  const triangleRatio = totalTriangles / triangleBudget

  return {
    totalDp,
    totalTriangles,
    dpBudget,
    triangleBudget,
    dpRatio,
    triangleRatio,
    status: getBudgetStatus(dpRatio, triangleRatio),
    byType: Array.from(byType.values()).sort((a, b) => b.dp + b.triangles - (a.dp + a.triangles)),
    byPoi: byPoi.sort((a, b) => b.dp + b.triangles - (a.dp + a.triangles)),
    visiblePoiIds,
  }
}

export const calculatePointDensity = (
  x: number,
  y: number,
  state: ProjectState,
  metric: 'dp' | 'triangles',
) => {
  const pseudoCamera: CameraConfig = {
    ...state.camera,
    x,
    y,
    fov: 360,
    viewDistance: 220,
    far: 220,
  }
  const sampleState = { ...state, camera: pseudoCamera }
  const perf = calculatePerformance(sampleState)
  return metric === 'dp' ? perf.totalDp : perf.totalTriangles
}

export const buildHeatSamples = (
  state: ProjectState,
  metric: 'dp' | 'triangles',
  step = 100,
): HeatSample[] => {
  const samples: HeatSample[] = []
  for (let y = step / 2; y < state.regionConfig.height; y += step) {
    for (let x = step / 2; x < state.regionConfig.width; x += step) {
      samples.push({ x, y, value: calculatePointDensity(x, y, state, metric) })
    }
  }
  return samples
}

export const clampRegion = (region: RegionConfig): RegionConfig => ({
  ...region,
  width: clamp(Math.round(region.width), 100, 2000),
  height: clamp(Math.round(region.height), 100, 2000),
})
