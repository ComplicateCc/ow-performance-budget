import { toPng } from 'html-to-image'
import { createDefaultLayer } from './data'
import { qualityConfigSchema, templateListSchema, projectSchema } from './schema'
import type { ProjectState, QualityConfigs, ObjectTemplate, PerformanceResult } from './types'

export const downloadText = (filename: string, text: string, type = 'application/json') => {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export const downloadJson = (filename: string, data: unknown) =>
  downloadText(filename, JSON.stringify(data, null, 2))

export const readJsonFile = async (file: File) => JSON.parse(await file.text()) as unknown

export const parseProject = (data: unknown): ProjectState => {
  const parsed = projectSchema.parse(data) as ProjectState
  return {
    ...parsed,
    defaultLayer: parsed.defaultLayer ?? createDefaultLayer(parsed.regionConfig),
  }
}

export const parseTemplates = (data: unknown): ObjectTemplate[] => templateListSchema.parse(data) as ObjectTemplate[]

export const parseQualityConfigs = (data: unknown): QualityConfigs => qualityConfigSchema.parse(data) as QualityConfigs

const fmt = (value: number) => Math.round(value).toLocaleString()

export const buildHtmlReport = (state: ProjectState, perf: PerformanceResult) => `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${state.metadata.name} - 性能预算报告</title>
  <style>
    body { font-family: Arial, sans-serif; background:#0f172a; color:#e2e8f0; padding:32px; }
    h1,h2 { color:#f8fafc; }
    table { width:100%; border-collapse:collapse; margin:16px 0 28px; }
    th,td { border:1px solid #334155; padding:10px; text-align:left; }
    th { background:#1e293b; }
    .metric { display:inline-block; margin-right:24px; padding:16px 20px; background:#111827; border:1px solid #334155; border-radius:8px; }
    .critical { color:#f87171; } .warning { color:#facc15; } .safe { color:#4ade80; }
  </style>
</head>
<body>
  <h1>${state.metadata.name} - 性能预算报告</h1>
  <p>生成时间：${new Date().toLocaleString()}</p>
  <div class="metric">DP：<strong>${fmt(perf.totalDp)}</strong> / ${fmt(perf.dpBudget)} (${Math.round(perf.dpRatio * 100)}%)</div>
  <div class="metric">Triangles：<strong>${fmt(perf.totalTriangles)}</strong> / ${fmt(perf.triangleBudget)} (${Math.round(perf.triangleRatio * 100)}%)</div>
  <div class="metric">状态：<strong class="${perf.status}">${perf.status}</strong></div>
  <h2>区域配置</h2>
  <p>${state.regionConfig.width}m × ${state.regionConfig.height}m，地块 ${state.regionConfig.tileSize}m，平台 ${state.platform}，画质 ${state.qualityLevel}</p>
  <h2>物件类型统计</h2>
  <table><thead><tr><th>类型</th><th>数量</th><th>DP</th><th>Triangles</th></tr></thead><tbody>
  ${perf.byType.map((item) => `<tr><td>${item.type}</td><td>${fmt(item.count)}</td><td>${fmt(item.dp)}</td><td>${fmt(item.triangles)}</td></tr>`).join('')}
  </tbody></table>
  <h2>POI 统计</h2>
  <table><thead><tr><th>POI</th><th>可见</th><th>DP</th><th>Triangles</th></tr></thead><tbody>
  ${perf.byPoi.map((item) => `<tr><td>${item.name}</td><td>${item.visible ? '是' : '否'}</td><td>${fmt(item.dp)}</td><td>${fmt(item.triangles)}</td></tr>`).join('')}
  </tbody></table>
  <script>window.print = window.print;</script>
</body>
</html>`

export const exportReport = (state: ProjectState, perf: PerformanceResult) =>
  downloadText('poi-performance-report.html', buildHtmlReport(state, perf), 'text/html')

export const exportScreenshot = async (node: HTMLElement) => {
  const dataUrl = await toPng(node, { pixelRatio: 2, backgroundColor: '#020617' })
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = 'poi-performance-view.png'
  a.click()
}
