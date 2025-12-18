import { cn } from '../utils'

describe('cn utility', () => {
    it('merges class names', () => {
        const result = cn('foo', 'bar')
        expect(result).toBe('foo bar')
    })

    it('handles conditional classes', () => {
        const isActive = true
        const result = cn('base', isActive && 'active')
        expect(result).toBe('base active')
    })

    it('filters out falsy values', () => {
        const result = cn('base', false && 'hidden', undefined, null)
        expect(result).toBe('base')
    })

    it('resolves Tailwind conflicts correctly', () => {
        // tailwind-merge should keep the last conflicting class
        const result = cn('p-4', 'p-8')
        expect(result).toBe('p-8')
    })

    it('handles array inputs', () => {
        const result = cn(['foo', 'bar'])
        expect(result).toBe('foo bar')
    })
})
