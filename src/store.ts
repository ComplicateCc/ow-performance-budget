import { create } from 'zustand'
import { clamp, clampRegion } from './calc'
import { createDefaultProject, emptyObjects, poiLevelMeta } from './data'
import type {
  CameraConfig,
  ObjectTemplate,
  ObjectType,
  Platform,
  PoiLevel,
  PoiRegion,
  ProjectState,
  QualityConfigs,
  RegionConfig,
} from './types'

const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`

const snapshotOf = (state: ProjectState): Omit<ProjectState, 'versions'> => {
  return structuredClone({
    schemaVersion: state.schemaVersion,
    metadata: state.metadata,
    regionConfig: state.regionConfig,
    platform: state.platform,
    qualityLevel: state.qualityLevel,
    qualityConfigs: state.qualityConfigs,
    objectTemplates: state.objectTemplates,
    pois: state.pois,
    camera: state.camera,
  })
}

interface AppStore extends ProjectState {
  selectedPoiId: string | null
  copiedPoi: PoiRegion | null
  selectedTemplateType: ObjectType
  heatmapEnabled: boolean
  heatmapMetric: 'dp' | 'triangles'
  compareVersionIds: string[]
  importError: string | null
  setProject: (project: ProjectState) => void
  updateRegion: (patch: Partial<RegionConfig>) => void
  setPlatform: (platform: Platform) => void
  setQualityLevel: (qualityLevel: number) => void
  updateCamera: (patch: Partial<CameraConfig>) => void
  selectPoi: (id: string | null) => void
  createPoi: (x: number, y: number, level?: PoiLevel) => void
  updatePoi: (id: string, patch: Partial<PoiRegion>) => void
  deletePoi: (id: string) => void
  duplicatePoi: (id: string) => void
  copyPoi: (id: string) => void
  pastePoi: () => void
  updatePoiObject: (poiId: string, type: ObjectType, count: number) => void
  updateTemplate: (template: ObjectTemplate) => void
  setSelectedTemplateType: (type: ObjectType) => void
  updateQualityConfig: (platform: Platform, level: number, patch: Partial<QualityConfigs[Platform][number]>) => void
  toggleHeatmap: () => void
  setHeatmapMetric: (metric: 'dp' | 'triangles') => void
  saveVersion: (name: string) => void
  setCompareVersionIds: (ids: string[]) => void
  importTemplates: (templates: ObjectTemplate[]) => void
  importQualityConfigs: (configs: QualityConfigs) => void
  setImportError: (error: string | null) => void
}

const initial = createDefaultProject()

export const useAppStore = create<AppStore>((set, get) => ({
  ...initial,
  selectedPoiId: initial.pois[0]?.id ?? null,
  copiedPoi: null,
  selectedTemplateType: 'tree',
  heatmapEnabled: false,
  heatmapMetric: 'dp',
  compareVersionIds: [],
  importError: null,
  setProject: (project) =>
    set({
      ...project,
      platform: 'mobile',
      selectedPoiId: project.pois[0]?.id ?? null,
      copiedPoi: null,
      importError: null,
    }),
  updateRegion: (patch) =>
    set((state) => {
      const region = clampRegion({ ...state.regionConfig, ...patch })
      return {
        regionConfig: region,
        camera: {
          ...state.camera,
          x: clamp(state.camera.x, 0, region.width),
          y: clamp(state.camera.y, 0, region.height),
        },
        pois: state.pois.map((poi) => ({
          ...poi,
          x: clamp(poi.x, 0, Math.max(0, region.width - poi.width)),
          y: clamp(poi.y, 0, Math.max(0, region.height - poi.height)),
        })),
      }
    }),
  setPlatform: (platform) => set({ platform }),
  setQualityLevel: (qualityLevel) => set({ qualityLevel }),
  updateCamera: (patch) =>
    set((state) => ({
      camera: {
        ...state.camera,
        ...patch,
        x: clamp(patch.x ?? state.camera.x, 0, state.regionConfig.width),
        y: clamp(patch.y ?? state.camera.y, 0, state.regionConfig.height),
        fov: clamp(patch.fov ?? state.camera.fov, 1, 170),
      },
    })),
  selectPoi: (id) => set({ selectedPoiId: id }),
  createPoi: (x, y, level = 'M') =>
    set((state) => {
      const size = poiLevelMeta[level].defaultSize
      const id = uid('poi')
      const poi: PoiRegion = {
        id,
        name: `POI-${state.pois.length + 1}`,
        description: '',
        level,
        x: clamp(x - size / 2, 0, Math.max(0, state.regionConfig.width - size)),
        y: clamp(y - size / 2, 0, Math.max(0, state.regionConfig.height - size)),
        width: size,
        height: size * 0.75,
        occlusionRate: state.regionConfig.globalOcclusionRate,
        objects: {
          ...emptyObjects(),
          meadow: level === 'S' ? 40 : 120,
          tree: level === 'XL' ? 80 : 25,
          building: level === 'XL' ? 18 : level === 'L' ? 8 : 2,
          prop: level === 'S' ? 20 : 60,
          effect: level === 'XL' ? 8 : 2,
        },
      }
      return { pois: [...state.pois, poi], selectedPoiId: id }
    }),
  updatePoi: (id, patch) =>
    set((state) => ({
      pois: state.pois.map((poi) =>
        poi.id === id
          ? {
              ...poi,
              ...patch,
              x: clamp(patch.x ?? poi.x, 0, Math.max(0, state.regionConfig.width - (patch.width ?? poi.width))),
              y: clamp(patch.y ?? poi.y, 0, Math.max(0, state.regionConfig.height - (patch.height ?? poi.height))),
              width: clamp(patch.width ?? poi.width, 20, state.regionConfig.width),
              height: clamp(patch.height ?? poi.height, 20, state.regionConfig.height),
              occlusionRate: clamp(patch.occlusionRate ?? poi.occlusionRate, 0, 100),
            }
          : poi,
      ),
    })),
  deletePoi: (id) =>
    set((state) => ({
      pois: state.pois.filter((poi) => poi.id !== id),
      selectedPoiId: state.selectedPoiId === id ? null : state.selectedPoiId,
    })),
  duplicatePoi: (id) => {
    const poi = get().pois.find((item) => item.id === id)
    if (!poi) return
    const copy = { ...structuredClone(poi), id: uid('poi'), name: `${poi.name} Copy`, x: poi.x + 30, y: poi.y + 30 }
    set((state) => ({ pois: [...state.pois, copy], selectedPoiId: copy.id }))
  },
  copyPoi: (id) => {
    const poi = get().pois.find((item) => item.id === id)
    if (poi) set({ copiedPoi: structuredClone(poi) })
  },
  pastePoi: () => {
    const copiedPoi = get().copiedPoi
    if (!copiedPoi) return
    const poi = {
      ...structuredClone(copiedPoi),
      id: uid('poi'),
      name: `${copiedPoi.name} Paste`,
      x: copiedPoi.x + 40,
      y: copiedPoi.y + 40,
    }
    set((state) => ({ pois: [...state.pois, poi], selectedPoiId: poi.id }))
  },
  updatePoiObject: (poiId, type, count) =>
    set((state) => ({
      pois: state.pois.map((poi) =>
        poi.id === poiId ? { ...poi, objects: { ...poi.objects, [type]: Math.max(0, Math.round(count)) } } : poi,
      ),
    })),
  updateTemplate: (template) =>
    set((state) => ({
      objectTemplates: state.objectTemplates.map((item) => (item.id === template.id ? template : item)),
    })),
  setSelectedTemplateType: (selectedTemplateType) => set({ selectedTemplateType }),
  updateQualityConfig: (platform, level, patch) =>
    set((state) => ({
      qualityConfigs: {
        ...state.qualityConfigs,
        [platform]: state.qualityConfigs[platform].map((quality) =>
          quality.level === level ? { ...quality, ...patch, budget: { ...quality.budget, ...patch.budget } } : quality,
        ),
      },
    })),
  toggleHeatmap: () => set((state) => ({ heatmapEnabled: !state.heatmapEnabled })),
  setHeatmapMetric: (heatmapMetric) => set({ heatmapMetric }),
  saveVersion: (name) =>
    set((state) => ({
      versions: [
        ...state.versions,
        { id: uid('version'), name: name || `版本 ${state.versions.length + 1}`, createdAt: new Date().toISOString(), snapshot: snapshotOf(state) },
      ],
    })),
  setCompareVersionIds: (compareVersionIds) => set({ compareVersionIds: compareVersionIds.slice(0, 2) }),
  importTemplates: (objectTemplates) => set({ objectTemplates }),
  importQualityConfigs: (qualityConfigs) => set({ qualityConfigs }),
  setImportError: (importError) => set({ importError }),
}))
