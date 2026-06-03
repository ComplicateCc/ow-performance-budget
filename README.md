# POI 区域性能预算工具

一个面向游戏场景规划的本地 Web 工具，用于在最大 `2000m × 2000m` 的单个区域内规划 POI 性能预算。

## 功能

- Canvas 地图：网格、坐标、缩放、平移、POI 拖拽、尺寸调整、视锥、LOD 距离带、热力图。
- POI 管理：创建、编辑、复制、粘贴、删除、等级、遮挡率、物件数量配置。
- 性能计算：DP/Triangles、LOD、HLOD、遮挡剔除、平台和画质预算对比。
- 配置管理：物件模板、画质平台配置、区域尺寸和地块大小。
- 数据输出：项目 JSON、模板 JSON、画质 JSON、HTML 报告、地图截图、版本快照对比。

## 开发命令

```bash
npm install
npm run dev
npm run lint
npm test
npm run build
```

开发服务默认可在 `http://127.0.0.1:5173` 访问。
