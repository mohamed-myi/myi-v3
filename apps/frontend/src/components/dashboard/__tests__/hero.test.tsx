import React from 'react'
import { render, screen } from '@testing-library/react'
import { Hero } from '../hero'

interface MockMotionProps {
    children?: React.ReactNode;
    className?: string;
}

// Mock framer-motion to avoid animation issues in tests
jest.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...props }: MockMotionProps) => <div {...props}>{children}</div>
    }
}))

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
    Play: () => <span data-testid="play-icon">▶</span>,
    Info: () => <span data-testid="info-icon">ℹ</span>
}))

const defaultProps = {
    title: 'Pink Floyd',
    subtitle: '#1 Artist',
    description: 'Your favorite artist over the last year.',
    image: 'http://img.com/pf.jpg'
}

describe('Hero', () => {
    it('renders title prop', () => {
        render(<Hero {...defaultProps} />)
        expect(screen.getByText('Pink Floyd')).toBeInTheDocument()
    })

    it('renders subtitle badge', () => {
        render(<Hero {...defaultProps} />)
        expect(screen.getByText('#1 Artist')).toBeInTheDocument()
    })

    it('renders description text', () => {
        render(<Hero {...defaultProps} />)
        expect(screen.getByText('Your favorite artist over the last year.')).toBeInTheDocument()
    })

    it('renders Play History button', () => {
        render(<Hero {...defaultProps} />)
        expect(screen.getByRole('button', { name: /play history/i })).toBeInTheDocument()
        expect(screen.getByTestId('play-icon')).toBeInTheDocument()
    })

    it('renders More Info button', () => {
        render(<Hero {...defaultProps} />)
        expect(screen.getByRole('button', { name: /more info/i })).toBeInTheDocument()
        expect(screen.getByTestId('info-icon')).toBeInTheDocument()
    })
})
