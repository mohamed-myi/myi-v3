import React from 'react'
import { render, screen } from '@testing-library/react'
import { ListeningStats } from '../listening-stats'

interface MockMotionProps {
    children?: React.ReactNode;
    className?: string;
}

// Mock framer-motion
jest.mock('framer-motion', () => ({
    motion: {
        div: ({ children, className }: MockMotionProps) => <div className={className}>{children}</div>
    }
}))

// Mock lucide-react
jest.mock('lucide-react', () => ({
    Music: () => <span data-testid="music-icon">Music</span>,
    Clock: () => <span data-testid="clock-icon">Clock</span>,
    Disc3: () => <span data-testid="disc-icon">Disc</span>,
    Users: () => <span data-testid="users-icon">Users</span>
}))

const mockProps = {
    totalPlays: 12345,
    formattedTime: '127h 45m',
    uniqueTracks: 892,
    uniqueArtists: 234
}

describe('ListeningStats', () => {
    it('renders section title', () => {
        render(<ListeningStats {...mockProps} />)
        expect(screen.getByText('Listening Stats')).toBeInTheDocument()
    })

    it('renders total plays with formatted number', () => {
        render(<ListeningStats {...mockProps} />)
        expect(screen.getByText('12,345')).toBeInTheDocument()
        expect(screen.getByText('Total Plays')).toBeInTheDocument()
    })

    it('renders listening time', () => {
        render(<ListeningStats {...mockProps} />)
        expect(screen.getByText('127h 45m')).toBeInTheDocument()
        expect(screen.getByText('Listening Time')).toBeInTheDocument()
    })

    it('renders unique tracks count', () => {
        render(<ListeningStats {...mockProps} />)
        expect(screen.getByText('892')).toBeInTheDocument()
        expect(screen.getByText('Unique Tracks')).toBeInTheDocument()
    })

    it('renders unique artists count', () => {
        render(<ListeningStats {...mockProps} />)
        expect(screen.getByText('234')).toBeInTheDocument()
        expect(screen.getByText('Unique Artists')).toBeInTheDocument()
    })

    it('renders all icons', () => {
        render(<ListeningStats {...mockProps} />)
        expect(screen.getByTestId('music-icon')).toBeInTheDocument()
        expect(screen.getByTestId('clock-icon')).toBeInTheDocument()
        expect(screen.getByTestId('disc-icon')).toBeInTheDocument()
        expect(screen.getByTestId('users-icon')).toBeInTheDocument()
    })

    it('handles null formatted time', () => {
        render(<ListeningStats {...mockProps} formattedTime={null} />)
        expect(screen.getByText('0m')).toBeInTheDocument()
    })
})
