import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Boxes,
  Camera,
  Clipboard,
  Copy,
  Download,
  FileInput,
  Flame,
  Gauge,
  Grid3X3,
  Layers,
  Map,
  MousePointer2,
  Plus,
  RotateCcw,
  RotateCw,
  Save,
  ScanLine,
  Settings2,
  Smartphone,
  Trash2,
  Upload,
} from 'lucide-react'
import './App.css'
import {
  buildHeatSamples,
  calculatePerformance,
  clamp,
  distance,
  getQuality,
  toRad,
} from './calc'
import { platformLabel, poiLevelMeta } from './data'
import {
  downloadJson,
  exportReport,
  exportScreenshot,
  parseProject,
  parseQualityConfigs,
  parseTemplates,
  readJsonFile,
} from './io'
import { useAppStore } from './store'
import type { ObjectTemplate, PoiLevel, PoiRegion, ProjectState } from './types'

const poiLevels = Object.keys(poiLevelMeta) as PoiLevel[]

const fmt = (value: number) => Math.round(value).toLocaleString()
const pct = (value: number) => `${Math.round(value * 100)}%`
const qualityNames = ['流畅', '均衡', '高清', '超清', '电影', '极致']

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (value: number) => void
}) {
  const [draft, setDraft] = useState(String(Number.isFinite(value) ? value : 0))
  useEffect(() => {
    setDraft(String(Number.isFinite(value) ? value : 0))
  }, [value])
  const commit = () => {
    const next = Number(draft)
    if (!Number.isFinite(next)) {
      setDraft(String(Number.isFinite(value) ? value : 0))
      return
    }
    onChange(clamp(next, min ?? -Number.MAX_SAFE_INTEGER, max ?? Number.MAX_SAFE_INTEGER))
  }
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur()
          }
          if (event.key === 'Escape') {
            setDraft(String(Number.isFinite(value) ? value : 0))
            event.currentTarget.blur()
          }
        }}
      />
    </label>
  )
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (value: number) => void
}) {
  return (
    <label className="range-field">
      <span>
        {label}
        <strong>{Math.round(value * 100) / 100}{suffix}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

function ProgressMetric({ label, value, budget, ratio }: { label: string; value: number; budget: number; ratio: number }) {
  const status = ratio > 0.85 ? 'critical' : ratio > 0.6 ? 'warning' : 'safe'
  return (
    <div className="metric">
      <div className="metric-head">
        <span>{label}</span>
        <strong>{fmt(value)}</strong>
      </div>
      <div className="bar">
        <span className={status} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
      <div className="metric-sub">
        <span>上限 {fmt(budget)}</span>
        <span>{pct(ratio)}</span>
      </div>
    </div>
  )
}

function MapCanvas({ result }: { result: ReturnType<typeof calculatePerformance> }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  const [zoomFactor, setZoomFactor] = useState(1)
  const [pointer, setPointer] = useState({ x: 0, y: 0 })
  const dragRef = useRef<null | { mode: 'move' | 'resize' | 'camera' | 'rotate'; id?: string; startX: number; startY: number }>(null)

  const state = useAppStore()
  const selectedPoi = state.pois.find((poi) => poi.id === state.selectedPoiId) ?? null
  const heatSamples = useMemo(() => (state.heatmapEnabled ? buildHeatSamples(state) : []), [state])
  const heatBudget = state.heatmapMetric === 'dp' ? result.dpBudget : result.triangleBudget
  const view = useMemo(() => {
    const padding = 56
    const baseZoom = Math.min(
      (Math.max(320, canvasSize.width) - padding) / state.regionConfig.width,
      (Math.max(320, canvasSize.height) - padding) / state.regionConfig.height,
    )
    const zoom = clamp(baseZoom * zoomFactor, 0.12, 3)
    return {
      zoom,
      x: (canvasSize.width - state.regionConfig.width * zoom) / 2,
      y: (canvasSize.height - state.regionConfig.height * zoom) / 2,
    }
  }, [canvasSize.height, canvasSize.width, state.regionConfig.height, state.regionConfig.width, zoomFactor])

  const screenToWorld = (sx: number, sy: number) => ({
    x: (sx - view.x) / view.zoom,
    y: (sy - view.y) / view.zoom,
  })

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const updateSize = () => {
      const rect = wrap.getBoundingClientRect()
      setCanvasSize({ width: rect.width, height: rect.height })
    }
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || canvasSize.width <= 0 || canvasSize.height <= 0) return
    const rect = canvasSize
    const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, rect.width, rect.height)
    ctx.fillStyle = '#020617'
    ctx.fillRect(0, 0, rect.width, rect.height)

    ctx.save()
    ctx.translate(view.x, view.y)
    ctx.scale(view.zoom, view.zoom)

    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, state.regionConfig.width, state.regionConfig.height)
    ctx.strokeStyle = '#334155'
    ctx.lineWidth = 1 / view.zoom
    ctx.strokeRect(0, 0, state.regionConfig.width, state.regionConfig.height)

    const drawGrid = (alpha = 0.7) => {
      ctx.strokeStyle = `rgba(148, 163, 184, ${alpha})`
      ctx.lineWidth = 1 / view.zoom
      for (let x = 0; x <= state.regionConfig.width; x += state.regionConfig.tileSize) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, state.regionConfig.height)
        ctx.stroke()
      }
      for (let y = 0; y <= state.regionConfig.height; y += state.regionConfig.tileSize) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(state.regionConfig.width, y)
        ctx.stroke()
      }
    }

    if (state.heatmapEnabled && heatSamples.length) {
      const heatColor = (value: number) => {
        const ratio = clamp(value / Math.max(1, heatBudget), 0, 1.4)
        const normalized = clamp(ratio, 0, 1)
        const fadeThreshold = Math.max(0.01, state.heatmapLowFade)
        const fadeRatio = clamp(normalized / fadeThreshold, 0, 1)
        const baseAlpha =
          normalized <= fadeThreshold
            ? 0.02 + Math.pow(fadeRatio, 1.8) * 0.1
            : 0.14 + normalized * 0.5
        const alpha = clamp(baseAlpha * state.heatmapOpacity, 0, 0.78)
        if (ratio < 0.45) return `rgba(34, 197, 94, ${alpha})`
        if (ratio < 0.7) return `rgba(234, 179, 8, ${alpha})`
        if (ratio < 1) return `rgba(249, 115, 22, ${alpha})`
        return `rgba(239, 68, 68, ${Math.min(0.86, alpha + 0.08)})`
      }
      heatSamples.forEach((sample) => {
        const width = Math.min(sample.size, state.regionConfig.width - sample.x)
        const height = Math.min(sample.size, state.regionConfig.height - sample.y)
        const cx = sample.x + width / 2
        const cy = sample.y + height / 2
        const valueOf = (metric: typeof sample.up) => state.heatmapMetric === 'dp' ? metric.dp : metric.triangles

        ctx.fillStyle = heatColor(valueOf(sample.up))
        ctx.beginPath()
        ctx.moveTo(sample.x, sample.y)
        ctx.lineTo(sample.x + width, sample.y)
        ctx.lineTo(cx, cy)
        ctx.closePath()
        ctx.fill()

        ctx.fillStyle = heatColor(valueOf(sample.right))
        ctx.beginPath()
        ctx.moveTo(sample.x + width, sample.y)
        ctx.lineTo(sample.x + width, sample.y + height)
        ctx.lineTo(cx, cy)
        ctx.closePath()
        ctx.fill()

        ctx.fillStyle = heatColor(valueOf(sample.down))
        ctx.beginPath()
        ctx.moveTo(sample.x + width, sample.y + height)
        ctx.lineTo(sample.x, sample.y + height)
        ctx.lineTo(cx, cy)
        ctx.closePath()
        ctx.fill()

        ctx.fillStyle = heatColor(valueOf(sample.left))
        ctx.beginPath()
        ctx.moveTo(sample.x, sample.y + height)
        ctx.lineTo(sample.x, sample.y)
        ctx.lineTo(cx, cy)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.18)'
        ctx.lineWidth = 0.5 / view.zoom
        ctx.strokeRect(sample.x, sample.y, width, height)
      })
    }

    if (state.regionConfig.showGrid) {
      drawGrid(state.heatmapEnabled ? 0.9 : 0.7)
    }

    const cam = state.camera
    const maxDistance = Math.min(cam.viewDistance, cam.far, getQuality(state).viewDistance)
    const start = toRad(cam.heading - cam.fov / 2)
    const end = toRad(cam.heading + cam.fov / 2)
    const lodBands = [0.28, 0.48, 0.68, 0.84, 1]
    lodBands.forEach((band, index) => {
      ctx.fillStyle = `rgba(59, 130, 246, ${0.05 + index * 0.018})`
      ctx.beginPath()
      ctx.moveTo(cam.x, cam.y)
      ctx.arc(cam.x, cam.y, maxDistance * band, start, end)
      ctx.closePath()
      ctx.fill()
    })
    ctx.strokeStyle = '#38bdf8'
    ctx.lineWidth = 2 / view.zoom
    ctx.beginPath()
    ctx.moveTo(cam.x, cam.y)
    ctx.lineTo(cam.x + Math.cos(start) * maxDistance, cam.y + Math.sin(start) * maxDistance)
    ctx.arc(cam.x, cam.y, maxDistance, start, end)
    ctx.lineTo(cam.x, cam.y)
    ctx.stroke()

    state.pois.forEach((poi) => {
      const meta = poiLevelMeta[poi.level]
      const visible = result.visiblePoiIds.includes(poi.id)
      const selected = poi.id === state.selectedPoiId
      ctx.fillStyle = visible ? meta.fill : 'rgba(30, 41, 59, 0.55)'
      ctx.strokeStyle = selected ? '#f8fafc' : visible ? meta.color : '#64748b'
      ctx.lineWidth = (selected ? 3 : 2) / view.zoom
      ctx.fillRect(poi.x, poi.y, poi.width, poi.height)
      ctx.strokeRect(poi.x, poi.y, poi.width, poi.height)
      ctx.fillStyle = '#f8fafc'
      ctx.font = `${Math.max(12 / view.zoom, 14)}px Fira Sans, sans-serif`
      ctx.fillText(`${poi.name} [${poi.level}]`, poi.x + 8, poi.y + 22)
      if (selected) {
        ctx.fillStyle = '#f8fafc'
        ctx.fillRect(poi.x + poi.width - 7, poi.y + poi.height - 7, 14, 14)
      }
    })

    ctx.fillStyle = '#22d3ee'
    ctx.strokeStyle = '#e0f2fe'
    ctx.lineWidth = 2 / view.zoom
    ctx.beginPath()
    ctx.arc(cam.x, cam.y, 8 / view.zoom, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(cam.x, cam.y)
    const headingHandle = {
      x: cam.x + Math.cos(toRad(cam.heading)) * 58,
      y: cam.y + Math.sin(toRad(cam.heading)) * 58,
    }
    ctx.lineTo(headingHandle.x, headingHandle.y)
    ctx.stroke()
    ctx.fillStyle = '#f8fafc'
    ctx.beginPath()
    ctx.arc(headingHandle.x, headingHandle.y, 6 / view.zoom, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    ctx.fillStyle = '#94a3b8'
    ctx.font = '12px Fira Code, monospace'
    ctx.fillText(`X ${Math.round(pointer.x)} / Y ${Math.round(pointer.y)} / Zoom ${Math.round(view.zoom * 100)}%`, 16, rect.height - 16)
  }, [state, view, pointer, result, heatSamples, heatBudget, canvasSize])

  const hitPoi = (x: number, y: number) =>
    state.pois
      .map((poi, index) => ({ poi, index }))
      .filter(({ poi }) => x >= poi.x && x <= poi.x + poi.width && y >= poi.y && y <= poi.y + poi.height)
      .sort((a, b) => a.poi.width * a.poi.height - b.poi.width * b.poi.height || b.index - a.index)[0]?.poi

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const world = screenToWorld(event.clientX - rect.left, event.clientY - rect.top)
    const hit = hitPoi(world.x, world.y)
    const cameraDistance = distance(world, state.camera)
    const rotateHandle = {
      x: state.camera.x + Math.cos(toRad(state.camera.heading)) * 58,
      y: state.camera.y + Math.sin(toRad(state.camera.heading)) * 58,
    }
    if (distance(world, rotateHandle) < 24) {
      dragRef.current = { mode: 'rotate', startX: world.x, startY: world.y }
      return
    }
    if (cameraDistance < 18) {
      dragRef.current = { mode: 'camera', startX: world.x, startY: world.y }
      return
    }
    if (hit) {
      state.selectPoi(hit.id)
      const isResize = world.x > hit.x + hit.width - 20 && world.y > hit.y + hit.height - 20
      dragRef.current = { mode: isResize ? 'resize' : 'move', id: hit.id, startX: world.x, startY: world.y }
    } else {
      state.selectPoi(null)
      dragRef.current = null
    }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const world = screenToWorld(event.clientX - rect.left, event.clientY - rect.top)
    setPointer(world)
    const drag = dragRef.current
    if (!drag) return
    if (drag.mode === 'camera') {
      state.updateCamera({ x: world.x, y: world.y })
      return
    }
    if (drag.mode === 'rotate') {
      const heading = (Math.atan2(world.y - state.camera.y, world.x - state.camera.x) * 180) / Math.PI
      state.updateCamera({ heading })
      return
    }
    const poi = state.pois.find((item) => item.id === drag.id)
    if (!poi) return
    const dx = world.x - drag.startX
    const dy = world.y - drag.startY
    if (drag.mode === 'move') {
      state.updatePoi(poi.id, { x: poi.x + dx, y: poi.y + dy })
    } else {
      state.updatePoi(poi.id, { width: poi.width + dx, height: poi.height + dy })
    }
    dragRef.current = { ...drag, startX: world.x, startY: world.y }
  }

  return (
    <div ref={wrapRef} className="map-stage" id="map-export-root">
      <canvas
        ref={canvasRef}
        aria-label="POI 性能预算地图"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={() => (dragRef.current = null)}
        onPointerLeave={() => (dragRef.current = null)}
        onDoubleClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          const world = screenToWorld(event.clientX - rect.left, event.clientY - rect.top)
          state.createPoi(world.x, world.y)
        }}
        onWheel={(event) => {
          event.preventDefault()
          setZoomFactor((prev) => clamp(prev * (event.deltaY > 0 ? 0.9 : 1.1), 0.45, 2.4))
        }}
      />
      <div className="map-toolbar">
        <button onClick={() => state.createPoi(state.camera.x, state.camera.y, 'M')}>
          <Plus size={16} /> 新建 POI
        </button>
        <button onClick={state.toggleHeatmap} className={state.heatmapEnabled ? 'active' : ''}>
          <Flame size={16} /> 热力图
        </button>
        <button onClick={() => state.updateRegion({ showGrid: !state.regionConfig.showGrid })}>
          <Grid3X3 size={16} /> 网格
        </button>
        <button onClick={() => setZoomFactor(1)}>
          <ScanLine size={16} /> 重置视图
        </button>
        <div className="zoom-control">
          <span>缩放</span>
          <input
            aria-label="画布缩放"
            type="range"
            min={0.45}
            max={2.4}
            step={0.05}
            value={zoomFactor}
            onChange={(event) => setZoomFactor(Number(event.target.value))}
          />
          <strong>{Math.round(zoomFactor * 100)}%</strong>
        </div>
        <div className="heading-control">
          <button aria-label="视角逆时针旋转 15 度" onClick={() => state.updateCamera({ heading: state.camera.heading - 15 })}>
            <RotateCcw size={15} />
          </button>
          <input
            aria-label="视角旋转"
            type="range"
            min={-180}
            max={180}
            step={1}
            value={state.camera.heading}
            onChange={(event) => state.updateCamera({ heading: Number(event.target.value) })}
          />
          <button aria-label="视角顺时针旋转 15 度" onClick={() => state.updateCamera({ heading: state.camera.heading + 15 })}>
            <RotateCw size={15} />
          </button>
          <strong>{Math.round(state.camera.heading)}°</strong>
        </div>
      </div>
      {state.heatmapEnabled && (
        <div className="heatmap-controls">
          <label>
            <span>热力透明</span>
            <input
              aria-label="热力图透明度"
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={state.heatmapOpacity}
              onChange={(event) => state.setHeatmapOpacity(Number(event.target.value))}
            />
            <strong>{Math.round(state.heatmapOpacity * 100)}%</strong>
          </label>
          <label>
            <span>低负载淡化</span>
            <input
              aria-label="低负载淡化阈值"
              type="range"
              min={0}
              max={0.6}
              step={0.05}
              value={state.heatmapLowFade}
              onChange={(event) => state.setHeatmapLowFade(Number(event.target.value))}
            />
            <strong>{Math.round(state.heatmapLowFade * 100)}%</strong>
          </label>
        </div>
      )}
      {selectedPoi && (
        <div className="floating-poi">
          <strong>{selectedPoi.name}</strong>
          <span>{selectedPoi.level} / {Math.round(selectedPoi.width)}m × {Math.round(selectedPoi.height)}m</span>
        </div>
      )}
      {state.heatmapEnabled && (
        <div className="heatmap-legend">
          <strong>{state.heatmapMetric === 'dp' ? 'DP' : 'Triangles'} 四向采样</strong>
          <span>上/右/下/左分别代表地块中心朝对应方向的采样结果</span>
          <div>
            <i className="low" />低
            <i className="mid" />中
            <i className="high" />高
            <i className="critical" />峰值
          </div>
        </div>
      )}
    </div>
  )
}

function PoiPanel() {
  const state = useAppStore()
  const selectedPoi = state.pois.find((poi) => poi.id === state.selectedPoiId)
  const [query, setQuery] = useState('')
  const filtered = state.pois.filter((poi) => poi.name.toLowerCase().includes(query.toLowerCase()))

  return (
    <section className="panel-section">
      <div className="section-title"><Map size={17} /> POI 管理</div>
      <div className="toolbar-row">
        <input placeholder="搜索 POI" value={query} onChange={(event) => setQuery(event.target.value)} />
        <button title="在相机位置新建" onClick={() => state.createPoi(state.camera.x, state.camera.y)}><Plus size={16} /></button>
      </div>
      <div className="poi-list">
        {filtered.map((poi) => (
          <button
            key={poi.id}
            className={`poi-row ${state.selectedPoiId === poi.id ? 'selected' : ''}`}
            onClick={() => state.selectPoi(poi.id)}
          >
            <span className="poi-color" style={{ background: poiLevelMeta[poi.level].color }} />
            <span>
              <strong>{poi.name}</strong>
              <small>{poi.level} / {Object.values(poi.objects).reduce((a, b) => a + b, 0)} 件</small>
            </span>
          </button>
        ))}
      </div>
      {selectedPoi && <PoiEditor poi={selectedPoi} />}
    </section>
  )
}

function PoiEditor({ poi }: { poi: PoiRegion }) {
  const state = useAppStore()
  const templates = state.objectTemplates
  return (
    <div className="editor-card">
      <input className="title-input" value={poi.name} onChange={(event) => state.updatePoi(poi.id, { name: event.target.value })} />
      <textarea value={poi.description} placeholder="描述" onChange={(event) => state.updatePoi(poi.id, { description: event.target.value })} />
      <div className="grid-two">
        <SelectField label="等级" value={poi.level} options={poiLevels.map((level) => ({ value: level, label: `${poiLevelMeta[level].name} ${level}` }))} onChange={(level) => state.updatePoi(poi.id, { level })} />
        <NumberField label="遮挡剔除率 %" value={poi.cullingRate} min={0} max={100} onChange={(value) => state.updatePoi(poi.id, { cullingRate: value })} />
        <NumberField label="X" value={Math.round(poi.x)} onChange={(value) => state.updatePoi(poi.id, { x: value })} />
        <NumberField label="Y" value={Math.round(poi.y)} onChange={(value) => state.updatePoi(poi.id, { y: value })} />
        <NumberField label="宽 m" value={Math.round(poi.width)} min={20} onChange={(value) => state.updatePoi(poi.id, { width: value })} />
        <NumberField label="高 m" value={Math.round(poi.height)} min={20} onChange={(value) => state.updatePoi(poi.id, { height: value })} />
      </div>
      <div className="object-counts">
        {templates.map((template) => (
          <NumberField
            key={template.type}
            label={template.name}
            value={poi.objects[template.type] ?? 0}
            min={0}
            onChange={(value) => state.updatePoiObject(poi.id, template.type, value)}
          />
        ))}
      </div>
      <div className="action-row">
        <button onClick={() => state.copyPoi(poi.id)}><Copy size={15} /> 复制</button>
        <button onClick={() => state.duplicatePoi(poi.id)}><Clipboard size={15} /> 副本</button>
        <button className="danger" onClick={() => state.deletePoi(poi.id)}><Trash2 size={15} /> 删除</button>
      </div>
    </div>
  )
}

function DefaultLayerPanel() {
  const state = useAppStore()
  const layer = state.defaultLayer
  const coveredArea = state.pois.reduce((sum, poi) => sum + poi.width * poi.height, 0)
  const regionArea = state.regionConfig.width * state.regionConfig.height
  const nonPoiRatio = Math.max(0, 1 - coveredArea / Math.max(1, regionArea))

  return (
    <section className="panel-section">
      <div className="section-title"><Layers size={17} /> 默认层</div>
      <div className="default-layer-summary">
        <strong>{Math.round(nonPoiRatio * 100)}%</strong>
        <span>按非 POI 区域参与预算，不与 POI 区域重复计算</span>
      </div>
      <div className="editor-card compact-editor">
        <input className="title-input" value={layer.name} onChange={(event) => state.updateDefaultLayer({ name: event.target.value })} />
        <textarea value={layer.description} placeholder="描述" onChange={(event) => state.updateDefaultLayer({ description: event.target.value })} />
        <div className="grid-two">
          <SelectField label="等级" value={layer.level} options={poiLevels.map((level) => ({ value: level, label: `${poiLevelMeta[level].name} ${level}` }))} onChange={(level) => state.updateDefaultLayer({ level })} />
          <NumberField label="遮挡剔除率 %" value={layer.cullingRate} min={0} max={100} onChange={(value) => state.updateDefaultLayer({ cullingRate: value })} />
        </div>
        <div className="object-counts">
          {state.objectTemplates.map((template) => (
            <NumberField
              key={template.type}
              label={template.name}
              value={layer.objects[template.type] ?? 0}
              min={0}
              onChange={(value) => state.updateDefaultLayerObject(template.type, value)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function TemplatePanel() {
  const state = useAppStore()
  const template = state.objectTemplates.find((item) => item.type === state.selectedTemplateType) ?? state.objectTemplates[0]
  const updateTemplate = (patch: Partial<ObjectTemplate>) => state.updateTemplate({ ...template, ...patch })
  const updateLod = (index: number, patch: Partial<ObjectTemplate['lods'][number]>) => {
    const lods = template.lods.map((item, i) => (i === index ? { ...item, ...patch } : item))
    state.updateTemplate({ ...template, lods })
  }
  const pctFromValue = (value: number, base: number) => (base > 0 ? (value / base) * 100 : 0)
  return (
    <section className="panel-section">
      <div className="section-title"><Boxes size={17} /> 物件模板</div>
      <div className="toolbar-row">
        <SelectField
          label="类型"
          value={state.selectedTemplateType}
          options={state.objectTemplates.map((item) => ({ value: item.type, label: item.name }))}
          onChange={state.setSelectedTemplateType}
        />
        <button className="icon-button" title="新增物件类型模板" onClick={state.createTemplate}><Plus size={16} /></button>
      </div>
      <div className="grid-two">
        <label className="field">
          <span>模板名称</span>
          <input value={template.name} onChange={(event) => updateTemplate({ name: event.target.value })} />
        </label>
        <label className="field">
          <span>颜色</span>
          <input type="color" value={template.color} onChange={(event) => updateTemplate({ color: event.target.value })} />
        </label>
      </div>
      <div className="grid-two">
        <NumberField label="LOD0 DP" value={template.baseDp} step={0.1} min={0} onChange={(value) => updateTemplate({ baseDp: value })} />
        <NumberField label="LOD0 Tri" value={template.baseTriangles} min={0} onChange={(value) => updateTemplate({ baseTriangles: value })} />
        <NumberField label="HLOD 距离" value={template.hlodDistance} min={0} onChange={(value) => updateTemplate({ hlodDistance: value })} />
        <NumberField label="消失距离(0进HLOD)" value={template.disappearDistance} min={0} onChange={(value) => updateTemplate({ disappearDistance: value })} />
      </div>
      <div className="lod-table">
        <div className="lod-head budget-head"><span>层级</span><span>距离</span><span>DP%</span><span>DP定值</span><span>Tri%</span><span>Tri定值</span></div>
        {template.lods.map((lod, index) => (
          <div className="lod-row budget-row" key={lod.level}>
            <span>LOD{lod.level}</span>
            <input value={lod.end} type="number" onChange={(event) => updateLod(index, { end: Number(event.target.value) })} />
            <input value={lod.dpPercent} type="number" onChange={(event) => updateLod(index, { dpPercent: Number(event.target.value) })} />
            <input value={Number((template.baseDp * lod.dpPercent / 100).toFixed(2))} type="number" step="0.1" onChange={(event) => updateLod(index, { dpPercent: pctFromValue(Number(event.target.value), template.baseDp) })} />
            <input value={lod.trianglePercent} type="number" onChange={(event) => updateLod(index, { trianglePercent: Number(event.target.value) })} />
            <input value={Math.round(template.baseTriangles * lod.trianglePercent / 100)} type="number" onChange={(event) => updateLod(index, { trianglePercent: pctFromValue(Number(event.target.value), template.baseTriangles) })} />
          </div>
        ))}
        <div className="lod-row budget-row hlod-row">
          <span>HLOD</span>
          <input value={template.hlodDistance} type="number" onChange={(event) => updateTemplate({ hlodDistance: Number(event.target.value) })} />
          <input value={template.hlodDpPercent} type="number" onChange={(event) => updateTemplate({ hlodDpPercent: Number(event.target.value) })} />
          <input value={Number((template.baseDp * template.hlodDpPercent / 100).toFixed(2))} type="number" step="0.1" onChange={(event) => updateTemplate({ hlodDpPercent: pctFromValue(Number(event.target.value), template.baseDp) })} />
          <input value={template.hlodTrianglePercent} type="number" onChange={(event) => updateTemplate({ hlodTrianglePercent: Number(event.target.value) })} />
          <input value={Math.round(template.baseTriangles * template.hlodTrianglePercent / 100)} type="number" onChange={(event) => updateTemplate({ hlodTrianglePercent: pctFromValue(Number(event.target.value), template.baseTriangles) })} />
        </div>
      </div>
      <p className="hint-text">消失距离大于 0 时，超过该距离后不再计入预算，也不会进入 HLOD；消失距离为 0 时按 HLOD 距离切换。</p>
    </section>
  )
}

function ConfigPanel() {
  const state = useAppStore()
  const quality = getQuality(state)
  return (
    <section className="panel-section">
      <div className="section-title"><Settings2 size={17} /> 区域与 Android 画质</div>
      <div className="platform-lock"><Smartphone size={16} /> 当前仅使用 Android 预算模板</div>
      <div className="grid-two">
        <NumberField label="宽度 m" value={state.regionConfig.width} min={100} max={2000} onChange={(value) => state.updateRegion({ width: value })} />
        <NumberField label="高度 m" value={state.regionConfig.height} min={100} max={2000} onChange={(value) => state.updateRegion({ height: value })} />
        <NumberField label="地块 m" value={state.regionConfig.tileSize} min={16} max={256} onChange={(value) => state.updateRegion({ tileSize: value })} />
        <NumberField label="全局剔除系数" value={state.regionConfig.globalCullingFactor} min={0} max={2} step={0.05} onChange={(value) => state.updateRegion({ globalCullingFactor: value })} />
      </div>
      <div className="segmented six">
        {[0, 1, 2, 3, 4, 5].map((level) => (
          <button key={level} className={level === state.qualityLevel ? 'active' : ''} onClick={() => state.setQualityLevel(level)}>
            Q{level} {qualityNames[level]}
          </button>
        ))}
      </div>
      <label className="field">
        <span>覆盖设备示例</span>
        <input
          value={quality.deviceExample ?? ''}
          onChange={(event) => state.updateQualityConfig('mobile', state.qualityLevel, { deviceExample: event.target.value })}
        />
      </label>
      <div className="grid-two">
        <NumberField label="DP 上限" value={quality.budget.dp} min={1} onChange={(value) => state.updateQualityConfig('mobile', state.qualityLevel, { budget: { dp: value, triangles: quality.budget.triangles } })} />
        <NumberField label="Tri 上限" value={quality.budget.triangles} min={1} onChange={(value) => state.updateQualityConfig('mobile', state.qualityLevel, { budget: { dp: quality.budget.dp, triangles: value } })} />
        <NumberField label="视距 m" value={quality.viewDistance} min={50} onChange={(value) => state.updateQualityConfig('mobile', state.qualityLevel, { viewDistance: value })} />
        <NumberField label="LOD 缩放" value={quality.lodScale} min={0.1} step={0.05} onChange={(value) => state.updateQualityConfig('mobile', state.qualityLevel, { lodScale: value })} />
      </div>
    </section>
  )
}

function LeftPanel() {
  return (
    <aside className="side-panel left-panel">
      <DefaultLayerPanel />
      <PoiPanel />
      <TemplatePanel />
      <ConfigPanel />
    </aside>
  )
}

function CameraPanel() {
  const state = useAppStore()
  return (
    <section className="panel-section">
      <div className="section-title"><Camera size={17} /> 视角与视锥</div>
      <div className="rotate-pad">
        <button onClick={() => state.updateCamera({ heading: state.camera.heading - 15 })}>
          <RotateCcw size={15} /> -15°
        </button>
        <RangeField
          label="视角旋转"
          value={state.camera.heading}
          min={-180}
          max={180}
          suffix="°"
          onChange={(value) => state.updateCamera({ heading: value })}
        />
        <button onClick={() => state.updateCamera({ heading: state.camera.heading + 15 })}>
          <RotateCw size={15} /> +15°
        </button>
      </div>
      <div className="grid-two">
        <NumberField label="相机 X" value={Math.round(state.camera.x)} onChange={(value) => state.updateCamera({ x: value })} />
        <NumberField label="相机 Y" value={Math.round(state.camera.y)} onChange={(value) => state.updateCamera({ y: value })} />
        <NumberField label="FOV" value={state.camera.fov} min={1} max={170} onChange={(value) => state.updateCamera({ fov: value })} />
        <NumberField label="视距" value={state.camera.viewDistance} min={10} onChange={(value) => state.updateCamera({ viewDistance: value })} />
        <NumberField label="远裁剪" value={state.camera.far} min={10} onChange={(value) => state.updateCamera({ far: value })} />
      </div>
    </section>
  )
}

function TemplateSimulationPanel() {
  const state = useAppStore()
  const template = state.objectTemplates.find((item) => item.type === state.selectedTemplateType) ?? state.objectTemplates[0]
  if (!template) return null
  const pctFromValue = (value: number, base: number) => (base > 0 ? (value / base) * 100 : 0)
  const updateLodValue = (index: number, metric: 'dp' | 'triangles', value: number) => {
    const lods = template.lods.map((lod, i) =>
      i === index
        ? {
            ...lod,
            ...(metric === 'dp'
              ? { dpPercent: pctFromValue(value, template.baseDp) }
              : { trianglePercent: pctFromValue(value, template.baseTriangles) }),
          }
        : lod,
    )
    state.updateTemplate({ ...template, lods })
  }
  return (
    <section className="panel-section">
      <div className="section-title"><Boxes size={17} /> 模板模拟值</div>
      <div className="simulate-title">
        <span style={{ background: template.color }} />
        <strong>{template.name}</strong>
      </div>
      <div className="simulate-table">
        <div className="simulate-head"><span>层级</span><span>DP定值</span><span>DP%</span><span>Tri定值</span><span>Tri%</span></div>
        {template.lods.map((lod, index) => (
          <div className="simulate-row" key={lod.level}>
            <span>LOD{lod.level}</span>
            <input type="number" value={Number((template.baseDp * lod.dpPercent / 100).toFixed(2))} step="0.1" onChange={(event) => updateLodValue(index, 'dp', Number(event.target.value))} />
            <strong>{Math.round(lod.dpPercent)}%</strong>
            <input type="number" value={Math.round(template.baseTriangles * lod.trianglePercent / 100)} onChange={(event) => updateLodValue(index, 'triangles', Number(event.target.value))} />
            <strong>{Math.round(lod.trianglePercent)}%</strong>
          </div>
        ))}
        <div className="simulate-row hlod-row">
          <span>HLOD</span>
          <input type="number" value={Number((template.baseDp * template.hlodDpPercent / 100).toFixed(2))} step="0.1" onChange={(event) => state.updateTemplate({ ...template, hlodDpPercent: pctFromValue(Number(event.target.value), template.baseDp) })} />
          <strong>{Math.round(template.hlodDpPercent)}%</strong>
          <input type="number" value={Math.round(template.baseTriangles * template.hlodTrianglePercent / 100)} onChange={(event) => state.updateTemplate({ ...template, hlodTrianglePercent: pctFromValue(Number(event.target.value), template.baseTriangles) })} />
          <strong>{Math.round(template.hlodTrianglePercent)}%</strong>
        </div>
      </div>
    </section>
  )
}

function StatsPanel({ result }: { result: ReturnType<typeof calculatePerformance> }) {
  const state = useAppStore()
  const templateByType = new globalThis.Map(state.objectTemplates.map((template) => [template.type, template]))
  const selectedIds = state.compareVersionIds
  const versions = selectedIds.map((id) => state.versions.find((item) => item.id === id)).filter(Boolean)
  const comparisons = versions.map((version) => ({ version, result: calculatePerformance({ ...version!.snapshot, versions: [] }) }))
  return (
    <aside className="side-panel right-panel">
      <section className="panel-section">
        <div className="section-title"><Gauge size={17} /> 实时性能</div>
        <div className={`status-pill ${result.status}`}>{result.status === 'safe' ? '安全' : result.status === 'warning' ? '警告' : '超标'}</div>
        <ProgressMetric label="绘制指令 DP" value={result.totalDp} budget={result.dpBudget} ratio={result.dpRatio} />
        <ProgressMetric label="Triangles" value={result.totalTriangles} budget={result.triangleBudget} ratio={result.triangleRatio} />
      </section>
      <section className="panel-section">
        <div className="section-title"><Layers size={17} /> 分类统计</div>
        <div className="stat-list">
          {result.byType.map((item) => (
            <div key={item.type} className="stat-row">
              <span style={{ color: templateByType.get(item.type)?.color ?? '#38bdf8' }}>{templateByType.get(item.type)?.name ?? item.type}</span>
              <strong>{fmt(item.dp)} DP</strong>
              <small>{fmt(item.triangles)} Tri / {fmt(item.count)} 件</small>
            </div>
          ))}
        </div>
      </section>
      <TemplateSimulationPanel />
      <section className="panel-section">
        <div className="section-title"><MousePointer2 size={17} /> POI 统计</div>
        <div className="stat-list compact">
          {result.byPoi.map((item) => (
            <button
              key={item.poiId}
              onClick={() => state.selectPoi(item.poiId === state.defaultLayer.id ? null : item.poiId)}
              className={item.visible ? '' : 'muted'}
            >
              <span>{item.name}</span>
              <strong>{fmt(item.dp)} / {fmt(item.triangles)}</strong>
              <small>视锥重叠 {Math.round(item.overlapRatio * 100)}%</small>
            </button>
          ))}
        </div>
      </section>
      <CameraPanel />
      <section className="panel-section">
        <div className="section-title"><Save size={17} /> 数据与报告</div>
        <DataActions result={result} />
      </section>
      <section className="panel-section">
        <div className="section-title"><FileInput size={17} /> 版本对比</div>
        <div className="action-row">
          <button onClick={() => state.saveVersion(`快照 ${state.versions.length + 1}`)}><Save size={15} /> 保存快照</button>
        </div>
        <div className="version-list">
          {state.versions.map((version) => (
            <label key={version.id} className="check-row">
              <input
                type="checkbox"
                checked={state.compareVersionIds.includes(version.id)}
                onChange={(event) => {
                  const ids = event.target.checked
                    ? [...state.compareVersionIds, version.id]
                    : state.compareVersionIds.filter((id) => id !== version.id)
                  state.setCompareVersionIds(ids)
                }}
              />
              <span>{version.name}</span>
            </label>
          ))}
        </div>
        {comparisons.length > 0 && (
          <div className="compare-box">
            {comparisons.map(({ version, result: comparison }) => (
              <div key={version!.id}>
                <strong>{version!.name}</strong>
                <span>DP {fmt(comparison.totalDp)} / Tri {fmt(comparison.totalTriangles)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </aside>
  )
}

function DataActions({ result }: { result: ReturnType<typeof calculatePerformance> }) {
  const state = useAppStore()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const templateRef = useRef<HTMLInputElement | null>(null)
  const qualityRef = useRef<HTMLInputElement | null>(null)

  const currentProject: ProjectState = {
    schemaVersion: 1,
    metadata: { ...state.metadata, updatedAt: new Date().toISOString() },
    regionConfig: state.regionConfig,
    defaultLayer: state.defaultLayer,
    platform: state.platform,
    qualityLevel: state.qualityLevel,
    qualityConfigs: state.qualityConfigs,
    objectTemplates: state.objectTemplates,
    pois: state.pois,
    camera: state.camera,
    versions: state.versions,
  }

  const handleImport = async (file: File | undefined, type: 'project' | 'templates' | 'quality') => {
    if (!file) return
    try {
      const json = await readJsonFile(file)
      if (type === 'project') state.setProject(parseProject(json))
      if (type === 'templates') state.importTemplates(parseTemplates(json))
      if (type === 'quality') state.importQualityConfigs(parseQualityConfigs(json))
      state.setImportError(null)
    } catch (error) {
      state.setImportError(error instanceof Error ? error.message : '导入失败')
    }
  }

  return (
    <>
      <input hidden type="file" ref={fileRef} accept="application/json" onChange={(event) => void handleImport(event.target.files?.[0], 'project')} />
      <input hidden type="file" ref={templateRef} accept="application/json" onChange={(event) => void handleImport(event.target.files?.[0], 'templates')} />
      <input hidden type="file" ref={qualityRef} accept="application/json" onChange={(event) => void handleImport(event.target.files?.[0], 'quality')} />
      <div className="action-grid">
        <button onClick={() => downloadJson('poi-performance-project.json', currentProject)}><Download size={15} /> 保存项目</button>
        <button onClick={() => fileRef.current?.click()}><Upload size={15} /> 加载项目</button>
        <button onClick={() => downloadJson('object-templates.json', state.objectTemplates)}><Download size={15} /> 模板导出</button>
        <button onClick={() => templateRef.current?.click()}><Upload size={15} /> 模板导入</button>
        <button onClick={() => downloadJson('quality-configs.json', state.qualityConfigs)}><Download size={15} /> 画质导出</button>
        <button onClick={() => qualityRef.current?.click()}><Upload size={15} /> 画质导入</button>
        <button onClick={() => exportReport(currentProject, result)}><FileInput size={15} /> HTML 报告</button>
        <button onClick={() => {
          const node = document.getElementById('map-export-root')
          if (node) void exportScreenshot(node)
        }}><Download size={15} /> 截图</button>
      </div>
      {state.importError && <div className="error-box">{state.importError}</div>}
    </>
  )
}

function StatusBar({ result }: { result: ReturnType<typeof calculatePerformance> }) {
  const state = useAppStore()
  const selected = state.pois.find((poi) => poi.id === state.selectedPoiId)
  return (
    <footer className="status-bar">
      <span>区域 {state.regionConfig.width}m × {state.regionConfig.height}m</span>
      <span>{platformLabel[state.platform]} / Q{state.qualityLevel}</span>
      <span>可见 POI {result.visiblePoiIds.length}/{state.pois.length}</span>
      <span>相机 {Math.round(state.camera.x)}, {Math.round(state.camera.y)} / 朝向 {Math.round(state.camera.heading)}°</span>
      <span>{selected ? `已选 ${selected.name}` : '未选择 POI'}</span>
    </footer>
  )
}

function App() {
  const state = useAppStore()
  const result = useMemo(() => calculatePerformance(state), [state])
  const [leftWidth, setLeftWidth] = useState(360)
  const resizingLeftRef = useRef(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key.toLowerCase() === 'c' && state.selectedPoiId) {
        event.preventDefault()
        state.copyPoi(state.selectedPoiId)
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'v') {
        event.preventDefault()
        state.pastePoi()
      }
      if (event.key === 'Delete' && state.selectedPoiId) {
        event.preventDefault()
        state.deletePoi(state.selectedPoiId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state])

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      if (!resizingLeftRef.current) return
      setLeftWidth(clamp(event.clientX, 300, 620))
    }
    const handleUp = () => {
      resizingLeftRef.current = false
      document.body.classList.remove('is-resizing-panel')
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [])

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div>
          <h1>POI 区域性能预算工具</h1>
          <p>单区域 POI 规划 / LOD HLOD 遮挡预算 / 最大 2000m × 2000m</p>
        </div>
        <div className="top-actions">
          <button onClick={() => useAppStore.getState().toggleHeatmap()} className={state.heatmapEnabled ? 'active' : ''}><Flame size={16} /> 热力图</button>
          <select value={state.heatmapMetric} onChange={(event) => state.setHeatmapMetric(event.target.value as 'dp' | 'triangles')}>
            <option value="dp">DP</option>
            <option value="triangles">Triangles</option>
          </select>
        </div>
      </header>
      <main
        className="workspace"
        style={{ gridTemplateColumns: `${leftWidth}px 6px minmax(360px, 1fr) minmax(300px, 370px)` }}
      >
        <LeftPanel />
        <div
          className="left-resizer"
          role="separator"
          aria-label="调整左侧栏宽度"
          onPointerDown={() => {
            resizingLeftRef.current = true
            document.body.classList.add('is-resizing-panel')
          }}
        />
        <MapCanvas result={result} />
        <StatsPanel result={result} />
      </main>
      <StatusBar result={result} />
    </div>
  )
}

export default App
