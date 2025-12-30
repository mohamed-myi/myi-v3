
import { render, screen } from '@testing-library/react'
import { ProcessingScreen } from '../processing-screen'

// Mock Image component since it's Next.js specific
jest.mock('next/image', () => ({
    __esModule: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
    default: ({ unoptimized: _unoptimized, ...props }: any) => (
        // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
        <img {...props} />
    )
}))

describe('ProcessingScreen Component', () => {
    it('renders with default message', () => {
        render(<ProcessingScreen />)

        expect(screen.getByText('Analyzing your music taste...')).toBeInTheDocument()
    })

    it('render with custom message', () => {
        render(<ProcessingScreen message="Custom loading message..." />)

        expect(screen.getByText('Custom loading message...')).toBeInTheDocument()
    })

    it('renders logo and branding', () => {
        render(<ProcessingScreen />)

        expect(screen.getByAltText('MYI')).toBeInTheDocument()
        expect(screen.getByText(/Syncing Account/i)).toBeInTheDocument()
        expect(screen.getByText(/MYI • Music Intelligence/i)).toBeInTheDocument()
    })
})
