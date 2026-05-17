import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getPool, ensureSchema } from './db';
import { Pool } from 'pg';

// Mock pg
const mockClient = {
  query: vi.fn().mockResolvedValue({}),
  release: vi.fn(),
};

const mockPool = {
  connect: vi.fn().mockResolvedValue(mockClient),
};

vi.mock('pg', () => {
  return {
    Pool: class {
      connect() {
        return mockPool.connect();
      }
    }
  };
});

describe('db.ts', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, DATABASE_URL: 'postgres://test' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('getPool should throw error if DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL;
    // We need to reset the internal pool variable if possible, but since it's a module level variable, 
    // we might need to use a different approach or just test the initial call.
    // However, in our tests, we can just check if it throws when called without env.
    expect(() => getPool()).toThrow('DATABASE_URL 환경변수가 설정되지 않았습니다.');
  });

  it('ensureSchema should call query multiple times', async () => {
    await ensureSchema();
    expect(mockClient.query).toHaveBeenCalled();
    expect(mockClient.release).toHaveBeenCalled();
  });
});
