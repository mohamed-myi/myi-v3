import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ImageWithFallback } from '../image-with-fallback'

describe('ImageWithFallback', () => {
    it('renders image with src', () => {
        render(
            <ImageWithFallback
                src="http://example.com/image.jpg"
                alt="Test image"
            />
        )

        const img = screen.getByAltText('Test image')
        expect(img).toBeInTheDocument()
        expect(img).toHaveAttribute('src', 'http://example.com/image.jpg')
    })

    it('applies className correctly', () => {
        render(
            <ImageWithFallback
                src="http://example.com/image.jpg"
                alt="Test image"
                className="custom-class"
            />
        )

        const img = screen.getByAltText('Test image')
        expect(img).toHaveClass('custom-class')
    })

    it('applies style correctly', () => {
        render(
            <ImageWithFallback
                src="http://example.com/image.jpg"
                alt="Test image"
                style={{ width: '100px' }}
            />
        )

        const img = screen.getByAltText('Test image')
        expect(img).toHaveStyle({ width: '100px' })
    })

    it('shows fallback on error', () => {
        render(
            <ImageWithFallback
                src="http://example.com/broken.jpg"
                alt="Test image"
                className="test-container"
            />
        )

        const img = screen.getByAltText('Test image')
        fireEvent.error(img)

        // Should now show fallback
        expect(screen.getByAltText('Error loading image')).toBeInTheDocument()
    })

    it('applies fallbackClassName when provided', () => {
        const { container } = render(
            <ImageWithFallback
                src="http://example.com/broken.jpg"
                alt="Test image"
                fallbackClassName="fallback-class"
            />
        )

        const img = screen.getByAltText('Test image')
        fireEvent.error(img)

        // Fallback container should have the fallback class
        expect(container.querySelector('.fallback-class')).toBeInTheDocument()
    })

    it('preserves original URL in data attribute on error', () => {
        render(
            <ImageWithFallback
                src="http://example.com/broken.jpg"
                alt="Test image"
            />
        )

        const img = screen.getByAltText('Test image')
        fireEvent.error(img)

        const fallbackImg = screen.getByAltText('Error loading image')
        expect(fallbackImg).toHaveAttribute('data-original-url', 'http://example.com/broken.jpg')
    })
})
