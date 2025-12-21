import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LogoutConfirmationDialog } from '../logout-confirmation-dialog'
import { api } from '@/lib/api'
import { useRouter } from 'next/navigation'

// Mocks
jest.mock('next/navigation', () => ({
    useRouter: jest.fn()
}))

jest.mock('@/lib/api', () => ({
    api: {
        post: jest.fn()
    }
}))

jest.mock('swr', () => ({
    mutate: jest.fn().mockResolvedValue(undefined)
}))

// Mock lucide-react
jest.mock('lucide-react', () => ({
    X: () => <span data-testid="x-icon">X</span>,
    LogOut: () => <span data-testid="logout-icon">LogOut</span>
}))

describe('LogoutConfirmationDialog', () => {
    const mockOnClose = jest.fn()
    const mockPush = jest.fn()

    beforeEach(() => {
        jest.clearAllMocks();
        (useRouter as jest.Mock).mockReturnValue({ push: mockPush })
    })

    it('renders nothing when isOpen is false', () => {
        const { container } = render(
            <LogoutConfirmationDialog isOpen={false} onClose={mockOnClose} />
        )
        expect(container.firstChild).toBeNull()
    })

    it('renders dialog when isOpen is true', () => {
        render(<LogoutConfirmationDialog isOpen={true} onClose={mockOnClose} />)
        expect(screen.getByText('Logout')).toBeInTheDocument()
        expect(screen.getByText(/Are you sure you want to sign out/)).toBeInTheDocument()
    })

    it('calls onClose when close button clicked', () => {
        render(<LogoutConfirmationDialog isOpen={true} onClose={mockOnClose} />)

        const closeButton = screen.getByTestId('x-icon').closest('button')
        fireEvent.click(closeButton!)

        expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('calls onClose when Cancel button clicked', () => {
        render(<LogoutConfirmationDialog isOpen={true} onClose={mockOnClose} />)

        fireEvent.click(screen.getByText('Cancel'))

        expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('calls onClose when backdrop clicked', () => {
        render(<LogoutConfirmationDialog isOpen={true} onClose={mockOnClose} />)

        // The backdrop is the first absolute div inside the fixed container
        const backdrop = document.querySelector('.bg-black\\/80')
        fireEvent.click(backdrop!)

        expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('calls API and redirects on Sign Out', async () => {
        (api.post as jest.Mock).mockResolvedValue({})

        render(<LogoutConfirmationDialog isOpen={true} onClose={mockOnClose} />)

        fireEvent.click(screen.getByText('Sign Out'))

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith('/auth/logout')
            expect(mockPush).toHaveBeenCalledWith('/')
        })
    })

    it('handles logout error gracefully', async () => {
        (api.post as jest.Mock).mockRejectedValue(new Error('Logout failed'))
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { })

        render(<LogoutConfirmationDialog isOpen={true} onClose={mockOnClose} />)

        fireEvent.click(screen.getByText('Sign Out'))

        await waitFor(() => {
            expect(api.post).toHaveBeenCalled()
            expect(mockPush).not.toHaveBeenCalled()
        })

        consoleSpy.mockRestore()
    })

    it('shows Signing out state during logout', async () => {
        (api.post as jest.Mock).mockImplementation(() => new Promise(() => { }))

        render(<LogoutConfirmationDialog isOpen={true} onClose={mockOnClose} />)

        fireEvent.click(screen.getByText('Sign Out'))

        expect(screen.getByText('Signing out...')).toBeInTheDocument()
    })

    it('disables buttons during logout', async () => {
        (api.post as jest.Mock).mockImplementation(() => new Promise(() => { }))

        render(<LogoutConfirmationDialog isOpen={true} onClose={mockOnClose} />)

        fireEvent.click(screen.getByText('Sign Out'))

        expect(screen.getByText('Cancel')).toBeDisabled()
        expect(screen.getByText('Signing out...')).toBeDisabled()
    })
})
