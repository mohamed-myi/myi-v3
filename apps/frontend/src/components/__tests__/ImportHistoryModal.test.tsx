import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ImportHistoryModal } from '../ImportHistoryModal'
import { api } from '@/lib/api'

// Mock api
jest.mock('@/lib/api', () => ({
    api: {
        post: jest.fn()
    }
}))

// Mock lucide-react
jest.mock('lucide-react', () => ({
    Upload: () => <span data-testid="upload-icon">Upload</span>,
    X: () => <span data-testid="x-icon">X</span>
}))

describe('ImportHistoryModal', () => {
    const mockOnClose = jest.fn()

    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('renders nothing when isOpen is false', () => {
        const { container } = render(
            <ImportHistoryModal isOpen={false} onClose={mockOnClose} />
        )
        expect(container.firstChild).toBeNull()
    })

    it('renders modal when isOpen is true', () => {
        render(<ImportHistoryModal isOpen={true} onClose={mockOnClose} />)
        expect(screen.getByText('Import History')).toBeInTheDocument()
    })

    it('renders file upload area', () => {
        render(<ImportHistoryModal isOpen={true} onClose={mockOnClose} />)
        expect(screen.getByText('Click to select file')).toBeInTheDocument()
        expect(screen.getByText(/endsong.json/)).toBeInTheDocument()
    })

    it('calls onClose when close button clicked', () => {
        render(<ImportHistoryModal isOpen={true} onClose={mockOnClose} />)

        const closeButton = screen.getByTestId('x-icon').closest('button')
        fireEvent.click(closeButton!)

        expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('calls onClose when Cancel button clicked', () => {
        render(<ImportHistoryModal isOpen={true} onClose={mockOnClose} />)

        fireEvent.click(screen.getByText('Cancel'))

        expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('disables Import button when no file selected', () => {
        render(<ImportHistoryModal isOpen={true} onClose={mockOnClose} />)

        const importBtn = screen.getByText('Import File')
        expect(importBtn).toBeDisabled()
    })

    it('shows file name when file is selected', () => {
        render(<ImportHistoryModal isOpen={true} onClose={mockOnClose} />)

        const file = new File(['{ "data": [] }'], 'test-endsong.json', { type: 'application/json' })
        const input = document.querySelector('input[type="file"]') as HTMLInputElement

        fireEvent.change(input, { target: { files: [file] } })

        expect(screen.getByText('test-endsong.json')).toBeInTheDocument()
    })

    it('enables Import button when file is selected', () => {
        render(<ImportHistoryModal isOpen={true} onClose={mockOnClose} />)

        const file = new File(['{ "data": [] }'], 'test.json', { type: 'application/json' })
        const input = document.querySelector('input[type="file"]') as HTMLInputElement

        fireEvent.change(input, { target: { files: [file] } })

        const importBtn = screen.getByText('Import File')
        expect(importBtn).not.toBeDisabled()
    })

    it('shows success status after successful upload', async () => {
        (api.post as jest.Mock).mockResolvedValue({ data: { jobId: 'job-123' } })

        render(<ImportHistoryModal isOpen={true} onClose={mockOnClose} />)

        const file = new File(['{ "data": [] }'], 'test.json', { type: 'application/json' })
        const input = document.querySelector('input[type="file"]') as HTMLInputElement

        fireEvent.change(input, { target: { files: [file] } })
        fireEvent.click(screen.getByText('Import File'))

        await waitFor(() => {
            expect(screen.getByText(/Upload complete!/)).toBeInTheDocument()
            expect(screen.getAllByText(/job-123/).length).toBeGreaterThanOrEqual(1)
        })
    })

    it('shows error status on upload failure', async () => {
        (api.post as jest.Mock).mockRejectedValue({ response: { data: { error: 'Invalid file' } } })

        render(<ImportHistoryModal isOpen={true} onClose={mockOnClose} />)

        const file = new File(['invalid'], 'test.json', { type: 'application/json' })
        const input = document.querySelector('input[type="file"]') as HTMLInputElement

        fireEvent.change(input, { target: { files: [file] } })
        fireEvent.click(screen.getByText('Import File'))

        await waitFor(() => {
            expect(screen.getByText(/Error:/)).toBeInTheDocument()
        })
    })

    it('shows uploading state during upload', async () => {
        (api.post as jest.Mock).mockImplementation(() => new Promise(() => { })) // Never resolves

        render(<ImportHistoryModal isOpen={true} onClose={mockOnClose} />)

        const file = new File(['{ "data": [] }'], 'test.json', { type: 'application/json' })
        const input = document.querySelector('input[type="file"]') as HTMLInputElement

        fireEvent.change(input, { target: { files: [file] } })
        fireEvent.click(screen.getByText('Import File'))

        // Both status and button show uploading text
        expect(screen.getAllByText('Uploading...').length).toBeGreaterThanOrEqual(1)
    })
})
