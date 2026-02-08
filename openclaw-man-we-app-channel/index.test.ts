import { describe, it, expect } from 'vitest';
import plugin from './index';

describe('WE XCX Plugin', () => {
  it('should define basic plugin properties', () => {
    expect(plugin.id).toBe('we-xcx');
    expect(plugin.name).toBe('WE XCX');
    expect(plugin.register).toBeDefined();
  });

  it('should have a valid config schema', () => {
    // Check if configSchema exists (it's empty in the code but defined in JSON)
    // The code exports `plugin` which has `configSchema: {}`
    expect(plugin.configSchema).toBeDefined();
  });
});
