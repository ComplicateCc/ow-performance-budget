import { z } from 'zod'

const metricBudgetSchema = z.object({
  dp: z.number().nonnegative(),
  triangles: z.number().nonnegative(),
})

const qualityLevelSchema = z.object({
  level: z.number().int().min(0).max(5),
  budget: metricBudgetSchema,
  viewDistance: z.number().positive(),
  lodScale: z.number().positive(),
  deviceExample: z.string().optional(),
})

const lodSchema = z.object({
  level: z.number().int().min(0).max(4),
  start: z.number().nonnegative(),
  end: z.number().positive(),
  dpPercent: z.number().min(0).max(100),
  trianglePercent: z.number().min(0).max(100),
})

const objectTypeSchema = z.string().min(1)

export const objectTemplateSchema = z.object({
  id: z.string().min(1),
  type: objectTypeSchema,
  name: z.string().min(1),
  color: z.string().min(1).default('#38bdf8'),
  baseDp: z.number().nonnegative(),
  baseTriangles: z.number().nonnegative(),
  lods: z.array(lodSchema).min(1).max(3),
  hlodDistance: z.number().nonnegative(),
  hlodDpPercent: z.number().min(0).max(100),
  hlodTrianglePercent: z.number().min(0).max(100),
  disappearDistance: z.number().nonnegative(),
})

const poiObjectsSchema = z.record(z.number().nonnegative())

const poiSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  level: z.enum(['XL', 'L', 'M', 'S']),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  cullingRate: z.number().min(0).max(100),
  objects: poiObjectsSchema,
})

const cameraSchema = z.object({
  x: z.number(),
  y: z.number(),
  heading: z.number(),
  fov: z.number().min(1).max(170),
  viewDistance: z.number().positive(),
  near: z.number().nonnegative(),
  far: z.number().positive(),
})

const regionSchema = z.object({
  width: z.number().min(100).max(2000),
  height: z.number().min(100).max(2000),
  tileSize: z.union([z.literal(10), z.literal(25), z.literal(50), z.literal(100)]),
  showGrid: z.boolean(),
  globalCullingFactor: z.number().min(0).max(2),
})

const qualityConfigsSchema = z.object({
  pc: z.array(qualityLevelSchema).length(6),
  console: z.array(qualityLevelSchema).length(6),
  mobile: z.array(qualityLevelSchema).length(6),
})

const snapshotSchema = z.object({
  schemaVersion: z.literal(1),
  metadata: z.object({ name: z.string(), updatedAt: z.string() }),
  regionConfig: regionSchema,
  platform: z.enum(['pc', 'console', 'mobile']),
  qualityLevel: z.number().int().min(0).max(5),
  qualityConfigs: qualityConfigsSchema,
  objectTemplates: z.array(objectTemplateSchema).min(1),
  pois: z.array(poiSchema),
  camera: cameraSchema,
})

const versionSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  snapshot: snapshotSchema,
})

export const projectSchema = snapshotSchema.extend({
  versions: z.array(versionSchema),
})

export const templateListSchema = z.array(objectTemplateSchema).min(1)

export const qualityConfigSchema = qualityConfigsSchema
