// Applies migrations to the isolated test database before the test run.
import 'dotenv/config';
import { execSync } from 'node:child_process';

const testDb = process.env.TEST_DATABASE_URL;
if (!testDb || testDb === process.env.DATABASE_URL) {
  console.error('TEST_DATABASE_URL must be set and different from DATABASE_URL');
  process.exit(1);
}
execSync('npx prisma migrate deploy', {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: testDb },
});
