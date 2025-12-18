import React from 'react'
import { render } from '@testing-library/react'
import { Skeleton } from '../skeleton'

describe('Skeleton', () => {
    it('renders with provided className', () => {
        const { container } = render(<Skeleton className="w-32 h-32" />)

        expect(container.firstChild).toHaveClass('w-32')
        expect(container.firstChild).toHaveClass('h-32')
    })

    it('applies animation class', () => {
        const { container } = render(<Skeleton />)

        expect(container.firstChild).toHaveClass('animate-pulse')
    })

    it('applies default styling', () => {
        const { container } = render(<Skeleton />)

        expect(container.firstChild).toHaveClass('bg-white/10')
        expect(container.firstChild).toHaveClass('rounded-md')
    })
})
