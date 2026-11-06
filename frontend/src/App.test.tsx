import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

// Toolchain smoke test; replaced by real component tests in Phase 6.
describe('App', () => {
  it('renders the page heading', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Calculator' })).toBeInTheDocument()
  })
})
