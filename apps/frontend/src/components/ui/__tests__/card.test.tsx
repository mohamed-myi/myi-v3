
import React from 'react'
import { render, screen } from '@testing-library/react'
import { Card } from '../card'

describe('Card Component', () => {
    it('renders children correctly', () => {
        render(<Card>Test Content</Card>)
        expect(screen.getByText('Test Content')).toBeInTheDocument()
    })

    it('applies variant classes correctly', () => {
        const { container } = render(<Card variant="poster">Poster Content</Card>)
        // poster variant has aspect-[2/3]
        expect(container.firstChild).toHaveClass('aspect-[2/3]')
    })

    it('applies custom className', () => {
        const { container } = render(<Card className="custom-class">Content</Card>)
        expect(container.firstChild).toHaveClass('custom-class')
    })
})
