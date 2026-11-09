import { existsSync } from 'node:fs';

/**
 * Loads .env.local, then .env, for standalone scripts (worker, migrations, seed).
 * Variables already set in the environment win. Next.js loads these files on its own.
 */
export function loadLocalEnv(): void {
  for (const file of ['.env.local', '.env']) {
    if (existsSync(file)) process.loadEnvFile(file);
  }
}
