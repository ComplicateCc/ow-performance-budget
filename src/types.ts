export type Platform = 'pc' | 'console' | 'mobile'
export type ObjectType = string
export type PoiLevel = 'XL' | 'L' | 'M' | 'S'
export type BudgetStatus = 'safe' | 'warning' | 'critical'

export interface RegionConfig {
  width: number
  height: number
  tileSize: 10 | 25 | 50 | 100
  showGrid: boolean
  globalCullingFactor: number
}

export interface MetricBudget {
  dp: number
  triangles: number
}

export interface QualityLevel {
  level: number
  budget: MetricBudget
  viewDistance: number
  lodScale: number
  deviceExample?: string
}

export type QualityConfigs = Record<Platform, QualityLevel[]>

export interface LodLevel {
  level: number
  start: number
  end: number
  dpPercent: number
  trianglePercent: number
}

export interface ObjectTemplate {
  id: string
  type: ObjectType
  name: string
  color: string
  baseDp: number
  baseTriangles: number
  lods: LodLevel[]
  hlodDistance: number
  hlodDpPercent: number
  hlodTrianglePercent: number
  disappearDistance: number
}

export type PoiObjects = Record<ObjectType, number>

export interface PoiRegion {
  id: string
  name: string
  description: string
  level: PoiLevel
  x: number
  y: number
  width: number
  height: number
  cullingRate: number
  objects: PoiObjects
  templateOverrides?: Partial<Record<ObjectType, ObjectTemplate>>
}

export interface CameraConfig {
  x: number
  y: number
  heading: number
  fov: number
  viewDistance: number
  near: number
  far: number
}

export interface CategoryStat {
  type: ObjectType
  dp: number
  triangles: number
  count: number
}

export interface PoiStat {
  poiId: string
  name: string
  dp: number
  triangles: number
  visible: boolean
}

export interface PerformanceResult {
  totalDp: number
  totalTriangles: number
  dpBudget: number
  triangleBudget: number
  dpRatio: number
  triangleRatio: number
  status: BudgetStatus
  byType: CategoryStat[]
  byPoi: PoiStat[]
  visiblePoiIds: string[]
}

export interface ProjectVersion {
  id: string
  name: string
  createdAt: string
  snapshot: Omit<ProjectState, 'versions'>
}

export interface ProjectState {
  schemaVersion: 1
  metadata: {
    name: string
    updatedAt: string
  }
  regionConfig: RegionConfig
  platform: Platform
  qualityLevel: number
  qualityConfigs: QualityConfigs
  objectTemplates: ObjectTemplate[]
  pois: PoiRegion[]
  camera: CameraConfig
  versions: ProjectVersion[]
}

export interface HeatSample {
  x: number
  y: number
  value: number
}
