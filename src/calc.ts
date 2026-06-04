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

const buildPoiSamples = (poi: PoiRegion, targetSamples = 64) => {
  const columns = Math.max(2, Math.round(Math.sqrt(targetSamples * (poi.width / Math.max(1, poi.height)))))
  const rows = Math.max(2, Math.round(targetSamples / columns))
  const samples: { x: number; y: number }[] = []
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      samples.push({
        x: poi.x + ((column + 0.5) / columns) * poi.width,
        y: poi.y + ((row + 0.5) / rows) * poi.height,
      })
    }
  }
  return samples
}

const buildRegionSamples = (region: RegionConfig, targetSamples = 256) => {
  const columns = Math.max(4, Math.round(Math.sqrt(targetSamples * (region.width / Math.max(1, region.height)))))
  const rows = Math.max(4, Math.round(targetSamples / columns))
  const samples: { x: number; y: number }[] = []
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      samples.push({
        x: ((column + 0.5) / columns) * region.width,
        y: ((row + 0.5) / rows) * region.height,
      })
    }
  }
  return samples
}

const isPointInPoi = (point: { x: number; y: number }, poi: PoiRegion) =>
  point.x >= poi.x && point.x <= poi.x + poi.width && point.y >= poi.y && point.y <= poi.y + poi.height

export const calculatePoiFrustumOverlap = (poi: PoiRegion, camera: CameraConfig) => {
  const samples = buildPoiSamples(poi)
  const visibleSamples = samples.filter((sample) => isPointInCamera(sample, camera))
  return {
    samples,
    visibleSamples,
    overlapRatio: visibleSamples.length / samples.length,
  }
}

const getTemplatePercentAtDistance = (template: ObjectTemplate, rawDistance: number, lodScale: number) => {
  const hasDisappearDistance = template.disappearDistance > 0
  if (hasDisappearDistance && rawDistance > template.disappearDistance * lodScale) {
    return null
  }
  const useHlod = !hasDisappearDistance && rawDistance >= template.hlodDistance * lodScale
  const lod = pickLod(template, rawDistance, lodScale)
  return {
    dpPercent: useHlod ? template.hlodDpPercent : lod.dpPercent,
    trianglePercent: useHlod ? template.hlodTrianglePercent : lod.trianglePercent,
  }
}

export const calculatePoiContribution = (
  poi: PoiRegion,
  templates: ObjectTemplate[],
  quality: QualityLevel,
  camera: CameraConfig,
  globalCullingFactor: number,
  sampleInput?: { samples: { x: number; y: number }[]; visibleSamples: { x: number; y: number }[] },
) => {
  const culling = clamp((poi.cullingRate / 100) * globalCullingFactor, 0, 1)
  const result: CategoryStat[] = []
  const { samples, visibleSamples } = sampleInput ?? calculatePoiFrustumOverlap(poi, camera)
  if (visibleSamples.length === 0) return result

  ;(Object.keys(poi.objects) as ObjectType[]).forEach((type) => {
    const count = poi.objects[type]
    if (!count) return
    const template = poi.templateOverrides?.[type] ?? getTemplateForType(templates, type)
    let weightedDpPercent = 0
    let weightedTrianglePercent = 0
    visibleSamples.forEach((sample) => {
      const percent = getTemplatePercentAtDistance(template, distance(sample, camera), quality.lodScale)
      if (!percent) return
      weightedDpPercent += percent.dpPercent / samples.length
      weightedTrianglePercent += percent.trianglePercent / samples.length
    })
    if (weightedDpPercent <= 0 && weightedTrianglePercent <= 0) return
    result.push({
      type,
      count: count * (visibleSamples.length / samples.length),
      dp: count * template.baseDp * (weightedDpPercent / 100) * (1 - culling),
      triangles: count * template.baseTriangles * (weightedTrianglePercent / 100) * (1 - culling),
    })
  })

  return result
}

export const calculateDefaultLayerOverlap = (state: ProjectState, camera: CameraConfig) => {
  const regionSamples = buildRegionSamples(state.regionConfig)
  const samples = regionSamples.filter((sample) => !state.pois.some((poi) => isPointInPoi(sample, poi)))
  const visibleSamples = samples.filter((sample) => isPointInCamera(sample, camera))
  return {
    samples,
    visibleSamples,
    overlapRatio: samples.length > 0 ? visibleSamples.length / samples.length : 0,
  }
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

  const defaultLayer = {
    ...state.defaultLayer,
    x: 0,
    y: 0,
    width: state.regionConfig.width,
    height: state.regionConfig.height,
  }
  const defaultOverlap = calculateDefaultLayerOverlap(state, camera)
  if (defaultOverlap.overlapRatio > 0) {
    const stats = calculatePoiContribution(
      defaultLayer,
      state.objectTemplates,
      quality,
      camera,
      state.regionConfig.globalCullingFactor,
      defaultOverlap,
    )
    const layerDp = stats.reduce((sum, item) => sum + item.dp, 0)
    const layerTriangles = stats.reduce((sum, item) => sum + item.triangles, 0)
    byPoi.push({
      poiId: defaultLayer.id,
      name: defaultLayer.name,
      dp: layerDp,
      triangles: layerTriangles,
      visible: true,
      overlapRatio: defaultOverlap.overlapRatio,
    })
    stats.forEach((item) => {
      const prev = byType.get(item.type) ?? { type: item.type, dp: 0, triangles: 0, count: 0 }
      byType.set(item.type, {
        type: item.type,
        dp: prev.dp + item.dp,
        triangles: prev.triangles + item.triangles,
        count: prev.count + item.count,
      })
    })
  } else {
    byPoi.push({ poiId: defaultLayer.id, name: defaultLayer.name, dp: 0, triangles: 0, visible: false, overlapRatio: 0 })
  }

  state.pois.forEach((poi) => {
    const visible = isPoiVisible(poi, camera)
    if (!visible) {
      byPoi.push({ poiId: poi.id, name: poi.name, dp: 0, triangles: 0, visible: false, overlapRatio: 0 })
      return
    }
    const { overlapRatio } = calculatePoiFrustumOverlap(poi, camera)
    if (overlapRatio <= 0) {
      byPoi.push({ poiId: poi.id, name: poi.name, dp: 0, triangles: 0, visible: false, overlapRatio: 0 })
      return
    }
    visiblePoiIds.push(poi.id)
    const stats = calculatePoiContribution(
      poi,
      state.objectTemplates,
      quality,
      camera,
      state.regionConfig.globalCullingFactor,
    )
    const poiDp = stats.reduce((sum, item) => sum + item.dp, 0)
    const poiTriangles = stats.reduce((sum, item) => sum + item.triangles, 0)
    byPoi.push({ poiId: poi.id, name: poi.name, dp: poiDp, triangles: poiTriangles, visible: true, overlapRatio })

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
  heading = state.camera.heading,
) => {
  const pseudoCamera: CameraConfig = {
    ...state.camera,
    x,
    y,
    heading,
  }
  const sampleState = { ...state, camera: pseudoCamera }
  return calculatePerformance(sampleState)
}

export const buildHeatSamples = (state: ProjectState): HeatSample[] => {
  const samples: HeatSample[] = []
  const step = clamp(state.regionConfig.tileSize, 16, 256)
  for (let y = 0; y < state.regionConfig.height; y += step) {
    for (let x = 0; x < state.regionConfig.width; x += step) {
      const width = Math.min(step, state.regionConfig.width - x)
      const height = Math.min(step, state.regionConfig.height - y)
      const cx = x + width / 2
      const cy = y + height / 2
      const up = calculatePointDensity(cx, cy, state, -90)
      const right = calculatePointDensity(cx, cy, state, 0)
      const down = calculatePointDensity(cx, cy, state, 90)
      const left = calculatePointDensity(cx, cy, state, 180)
      samples.push({
        x,
        y,
        size: step,
        up: { dp: up.totalDp, triangles: up.totalTriangles },
        right: { dp: right.totalDp, triangles: right.totalTriangles },
        down: { dp: down.totalDp, triangles: down.totalTriangles },
        left: { dp: left.totalDp, triangles: left.totalTriangles },
      })
    }
  }
  return samples
}

export const clampRegion = (region: RegionConfig): RegionConfig => ({
  ...region,
  width: clamp(Math.round(region.width), 100, 2000),
  height: clamp(Math.round(region.height), 100, 2000),
  tileSize: clamp(Math.round(region.tileSize), 16, 256),
})
