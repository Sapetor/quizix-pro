/**
 * Unit Tests for player-change-name socket validation
 * Verifies the schema wired into validateSocketEvent rejects malformed/oversized
 * names and accepts valid ones — matching the join/player-name constraints.
 */

const {
    playerChangeNameSchema,
    validateSocketEvent
} = require('../../services/validation-schemas.js');

describe('Player Change Name Schema', () => {
    it('should accept a valid name', () => {
        const result = playerChangeNameSchema.safeParse({ newName: 'NewPlayer' });
        expect(result.success).toBe(true);
    });

    it('should accept a single-character name (min length)', () => {
        const result = playerChangeNameSchema.safeParse({ newName: 'A' });
        expect(result.success).toBe(true);
    });

    it('should accept a 50-character name (max length)', () => {
        const result = playerChangeNameSchema.safeParse({ newName: 'x'.repeat(50) });
        expect(result.success).toBe(true);
    });

    it('should reject an empty name', () => {
        const result = playerChangeNameSchema.safeParse({ newName: '' });
        expect(result.success).toBe(false);
    });

    it('should reject a name longer than 50 characters', () => {
        const result = playerChangeNameSchema.safeParse({ newName: 'x'.repeat(51) });
        expect(result.success).toBe(false);
    });

    it('should reject a missing newName field', () => {
        const result = playerChangeNameSchema.safeParse({});
        expect(result.success).toBe(false);
    });

    it('should reject a non-string newName', () => {
        const result = playerChangeNameSchema.safeParse({ newName: 12345 });
        expect(result.success).toBe(false);
    });
});

describe('Socket Event Validation — player-change-name', () => {
    it('should validate a correct player-change-name event', () => {
        const result = validateSocketEvent('player-change-name', { newName: 'Bob' });
        expect(result.valid).toBe(true);
        expect(result.data.newName).toBe('Bob');
    });

    it('should reject an oversized name', () => {
        const result = validateSocketEvent('player-change-name', { newName: 'x'.repeat(51) });
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject null data', () => {
        const result = validateSocketEvent('player-change-name', null);
        expect(result.valid).toBe(false);
    });
});
