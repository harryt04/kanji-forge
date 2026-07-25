import { describe, it, expect } from 'vitest';
import { SRS_SPEC_VERSION } from './types';

describe('SRS types', () => {
  it('should export SRS_SPEC_VERSION', () => {
    expect(SRS_SPEC_VERSION).toBe('1.0');
  });
});
