import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SettingsPanel } from '../settings-panel'

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
    Settings: () => <span data-testid="settings-icon">Settings</span>,
    Globe: () => <span data-testid="globe-icon">Globe</span>,
    Eye: () => <span data-testid="eye-icon">Eye</span>,
    Mail: () => <span data-testid="mail-icon">Mail</span>,
    Music: () => <span data-testid="music-icon">Music</span>,
    Users: () => <span data-testid="users-icon">Users</span>,
    Clock: () => <span data-testid="clock-icon">Clock</span>
}))

const mockSettings = {
    isPublicProfile: true,
    shareTopTracks: true,
    shareTopArtists: false,
    shareListeningTime: true,
    emailNotifications: false,
    timezone: 'America/Chicago'
}

const mockMutate = jest.fn()
const mockUpdateSettings = jest.fn()

// Mock hooks
jest.mock('@/hooks/use-profile', () => ({
    useSettings: jest.fn(() => ({
        settings: mockSettings,
        isLoading: false,
        mutate: mockMutate
    })),
    useUpdateSettings: jest.fn(() => ({
        updateSettings: mockUpdateSettings
    }))
}))

describe('SettingsPanel', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockUpdateSettings.mockResolvedValue({})
    })

    it('renders settings title', () => {
        render(<SettingsPanel />)
        expect(screen.getAllByText('Settings').length).toBeGreaterThanOrEqual(1)
        expect(screen.getByTestId('settings-icon')).toBeInTheDocument()
    })

    it('renders all toggle options', () => {
        render(<SettingsPanel />)
        expect(screen.getByText('Public Profile')).toBeInTheDocument()
        expect(screen.getByText('Share Top Tracks')).toBeInTheDocument()
        expect(screen.getByText('Share Top Artists')).toBeInTheDocument()
        expect(screen.getByText('Share Listening Time')).toBeInTheDocument()
        expect(screen.getByText('Email Notifications')).toBeInTheDocument()
    })

    it('renders timezone selector', () => {
        render(<SettingsPanel />)
        expect(screen.getByText('Timezone')).toBeInTheDocument()
        expect(screen.getByTestId('globe-icon')).toBeInTheDocument()
    })

    it('displays current timezone value', () => {
        render(<SettingsPanel />)
        const select = screen.getByRole('combobox')
        expect(select).toHaveValue('America/Chicago')
    })

    it('toggles public profile setting', async () => {
        render(<SettingsPanel />)

        // Find the Public Profile toggle button (first toggle after the text)
        const toggleButtons = screen.getAllByRole('button')
        const publicProfileToggle = toggleButtons.find(btn =>
            btn.className.includes('rounded-full')
        )

        if (publicProfileToggle) {
            fireEvent.click(publicProfileToggle)

            await waitFor(() => {
                expect(mockMutate).toHaveBeenCalled()
                expect(mockUpdateSettings).toHaveBeenCalled()
            })
        }
    })

    it('changes timezone via select', async () => {
        render(<SettingsPanel />)

        const select = screen.getByRole('combobox')
        fireEvent.change(select, { target: { value: 'America/New_York' } })

        await waitFor(() => {
            expect(mockMutate).toHaveBeenCalled()
            expect(mockUpdateSettings).toHaveBeenCalledWith({ timezone: 'America/New_York' })
        })
    })
})
