import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';
import os from 'node:os';
import path from 'node:path';

dotenv.config();
const testDb = process.env.TEST_DATABASE_URL;
if (!testDb || testDb === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must be set and different from DATABASE_URL');
}

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    fileParallelism: false, // tests share one database
    testTimeout: 20_000,
    hookTimeout: 20_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDb,
      JWT_SECRET: 'test-secret-test-secret-test-secret-test',
      UPLOAD_DIR: path.join(os.tmpdir(), 'job-pipeline-test-resumes'),
      MAX_UPLOAD_BYTES: '50000',
      CLIENT_ORIGIN: 'http://localhost:5173',
    },
  },
});
