import type {
  CameraConfig,
  ObjectTemplate,
  ObjectType,
  Platform,
  PoiLevel,
  PoiObjects,
  PoiRegion,
  ProjectState,
  QualityConfigs,
  RegionConfig,
} from './types'

export const objectTypeMeta: Record<ObjectType, { name: string; color: string }> = {
  meadow: { name: '植被', color: '#22c55e' },
  tree: { name: '树木', color: '#14b8a6' },
  building: { name: '建筑', color: '#60a5fa' },
  prop: { name: '小物件', color: '#f59e0b' },
  effect: { name: '特效', color: '#a78bfa' },
}

export const poiLevelMeta: Record<
  PoiLevel,
  { name: string; color: string; fill: string; defaultSize: number }
> = {
  XL: { name: '特大', color: '#ef4444', fill: 'rgba(239, 68, 68, 0.24)', defaultSize: 260 },
  L: { name: '大', color: '#f97316', fill: 'rgba(249, 115, 22, 0.22)', defaultSize: 180 },
  M: { name: '中', color: '#eab308', fill: 'rgba(234, 179, 8, 0.2)', defaultSize: 110 },
  S: { name: '小', color: '#22c55e', fill: 'rgba(34, 197, 94, 0.18)', defaultSize: 60 },
}

export const platformLabel: Record<Platform, string> = {
  pc: 'PC',
  console: '主机',
  mobile: 'Android',
}

export const emptyObjects = (): PoiObjects => ({
  meadow: 0,
  tree: 0,
  building: 0,
  prop: 0,
  effect: 0,
})

const lods = (distanceScale = 1) => [
  { level: 0, start: 0, end: 25 * distanceScale, dpPercent: 100, trianglePercent: 100 },
  { level: 1, start: 25 * distanceScale, end: 55 * distanceScale, dpPercent: 80, trianglePercent: 60 },
  { level: 2, start: 55 * distanceScale, end: 100 * distanceScale, dpPercent: 55, trianglePercent: 35 },
  { level: 3, start: 100 * distanceScale, end: 160 * distanceScale, dpPercent: 32, trianglePercent: 18 },
  { level: 4, start: 160 * distanceScale, end: 240 * distanceScale, dpPercent: 14, trianglePercent: 8 },
]

export const defaultTemplates: ObjectTemplate[] = [
  {
    id: 'tpl-meadow',
    type: 'meadow',
    name: '标准植被',
    baseDp: 1.2,
    baseTriangles: 260,
    lods: lods(0.8),
    hlodDistance: 180,
    hlodDpPercent: 8,
    hlodTrianglePercent: 4,
    disappearDistance: 260,
  },
  {
    id: 'tpl-tree',
    type: 'tree',
    name: '标准树木',
    baseDp: 2.6,
    baseTriangles: 1800,
    lods: lods(1),
    hlodDistance: 220,
    hlodDpPercent: 10,
    hlodTrianglePercent: 5,
    disappearDistance: 320,
  },
  {
    id: 'tpl-building',
    type: 'building',
    name: '标准建筑',
    baseDp: 5,
    baseTriangles: 9000,
    lods: lods(1.4),
    hlodDistance: 340,
    hlodDpPercent: 18,
    hlodTrianglePercent: 10,
    disappearDistance: 600,
  },
  {
    id: 'tpl-prop',
    type: 'prop',
    name: '标准小物件',
    baseDp: 1.6,
    baseTriangles: 780,
    lods: lods(0.75),
    hlodDistance: 150,
    hlodDpPercent: 7,
    hlodTrianglePercent: 4,
    disappearDistance: 230,
  },
  {
    id: 'tpl-effect',
    type: 'effect',
    name: '标准特效',
    baseDp: 3.8,
    baseTriangles: 420,
    lods: lods(0.9),
    hlodDistance: 200,
    hlodDpPercent: 16,
    hlodTrianglePercent: 12,
    disappearDistance: 300,
  },
]

export const defaultRegion: RegionConfig = {
  width: 1000,
  height: 1000,
  tileSize: 25,
  showGrid: true,
  globalOcclusionRate: 18,
}

export const defaultCamera: CameraConfig = {
  x: 500,
  y: 720,
  heading: -90,
  fov: 80,
  viewDistance: 520,
  near: 1,
  far: 800,
}

const androidQualityLevels = [
  {
    level: 0,
    budget: { dp: 150, triangles: 150_000 },
    viewDistance: 220,
    lodScale: 0.55,
    deviceExample: '入门机型（红米 Note 8）',
  },
  {
    level: 1,
    budget: { dp: 150, triangles: 150_000 },
    viewDistance: 260,
    lodScale: 0.65,
    deviceExample: '中低端（红米 Note 11）',
  },
  {
    level: 2,
    budget: { dp: 225, triangles: 255_000 },
    viewDistance: 320,
    lodScale: 0.78,
    deviceExample: '中端主力（小米 10/11）',
  },
  {
    level: 3,
    budget: { dp: 225, triangles: 300_000 },
    viewDistance: 380,
    lodScale: 0.9,
    deviceExample: '次旗舰（iQOO 11 Pro）',
  },
  {
    level: 4,
    budget: { dp: 275, triangles: 330_000 },
    viewDistance: 460,
    lodScale: 1,
    deviceExample: '高端旗舰（iQOO 12 Pro）',
  },
  {
    level: 5,
    budget: { dp: 500, triangles: 600_000 },
    viewDistance: 560,
    lodScale: 1.12,
    deviceExample: '旗舰机型（iQOO 13 / 小米 15）',
  },
]

export const defaultQualityConfigs: QualityConfigs = {
  pc: androidQualityLevels.map((item) => ({ ...item, budget: { ...item.budget } })),
  console: androidQualityLevels.map((item) => ({ ...item, budget: { ...item.budget } })),
  mobile: androidQualityLevels.map((item) => ({ ...item, budget: { ...item.budget } })),
}

export const defaultPois: PoiRegion[] = [
  {
    id: 'poi-city-gate',
    name: '城门入口',
    description: '玩家进入区域后的第一视觉焦点',
    level: 'L',
    x: 410,
    y: 320,
    width: 210,
    height: 160,
    occlusionRate: 38,
    objects: { meadow: 120, tree: 28, building: 9, prop: 55, effect: 4 },
  },
  {
    id: 'poi-market',
    name: '市集广场',
    description: '建筑和小物件密集的中型 POI',
    level: 'M',
    x: 640,
    y: 520,
    width: 160,
    height: 130,
    occlusionRate: 45,
    objects: { meadow: 35, tree: 10, building: 6, prop: 120, effect: 6 },
  },
  {
    id: 'poi-forest',
    name: '林地边缘',
    description: '植被和树木为主，低遮挡率',
    level: 'M',
    x: 170,
    y: 520,
    width: 220,
    height: 170,
    occlusionRate: 20,
    objects: { meadow: 360, tree: 90, building: 0, prop: 28, effect: 2 },
  },
  {
    id: 'poi-shrine',
    name: '小型遗迹',
    description: '远处视觉锚点',
    level: 'S',
    x: 760,
    y: 210,
    width: 90,
    height: 80,
    occlusionRate: 28,
    objects: { meadow: 50, tree: 8, building: 2, prop: 34, effect: 3 },
  },
]

export const createDefaultProject = (): ProjectState => ({
  schemaVersion: 1,
  metadata: {
    name: 'POI 区域性能预算',
    updatedAt: new Date().toISOString(),
  },
  regionConfig: defaultRegion,
  platform: 'mobile',
  qualityLevel: 3,
  qualityConfigs: defaultQualityConfigs,
  objectTemplates: defaultTemplates,
  pois: defaultPois,
  camera: defaultCamera,
  versions: [],
})
