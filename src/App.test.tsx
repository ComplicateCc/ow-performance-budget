import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the planning workspace panels', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'POI 区域性能预算工具' })).toBeInTheDocument()
    expect(screen.getByText('POI 管理')).toBeInTheDocument()
    expect(screen.getByText('实时性能')).toBeInTheDocument()
    expect(screen.getByText('数据与报告')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /新建 POI/ })).toBeInTheDocument()
  })
})
