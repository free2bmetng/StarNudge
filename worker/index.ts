import { loadLocalEnv } from '../src/lib/load-env';
import { tick } from '../src/lib/services/pipeline';
import { closeDb } from '../src/lib/db';

loadLocalEnv();

const intervalMs = Number(process.env.WORKER_INTERVAL_MS ?? 15_000);
let stopping = false;

process.on('SIGINT', () => {
  stopping = true;
});
process.on('SIGTERM', () => {
  stopping = true;
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log(`StarNudge worker started (every ${intervalMs} ms)`);
  while (!stopping) {
    try {
      const result = await tick();
      if (result.processed > 0 || result.deletions > 0) {
        console.log(`tick: ${result.processed} request(s), ${result.deletions} deletion(s)`);
      }
    } catch (err) {
      console.error('tick failed', err);
    }
    await sleep(intervalMs);
  }
  await closeDb();
  console.log('StarNudge worker stopped');
}

main();
