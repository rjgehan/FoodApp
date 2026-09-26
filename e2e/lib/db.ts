import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Straight into the local dev Postgres, for the few things the API rightly will not do: wind a
 * link's clock back, or make an account the way accounts were made before invite links. Only
 * ever the docker-compose.dev.yml database on this machine (DB_NAME picks another database in
 * it, for testing a patched copy side by side).
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DB_NAME = process.env.DB_NAME ?? 'mealplanner';

let container: string | null | undefined;

function postgres(): string | null {
  if (container === undefined) {
    try {
      container =
        execFileSync('docker', ['compose', '-f', join(ROOT, 'docker-compose.dev.yml'), 'ps', '-q', 'postgres'])
          .toString()
          .trim() || null;
    } catch {
      container = null;
    }
  }
  return container;
}

/** Runs one statement and returns what it printed, unaligned — or null with no docker to run it. */
export function sqlQuery(statement: string): string | null {
  const pg = postgres();
  if (!pg) return null;
  try {
    // stderr dropped: psql's NOTICEs ("already exists, skipping") are not worth a line in the report.
    return execFileSync(
      'docker',
      ['exec', pg, 'psql', '-qtA', '-v', 'ON_ERROR_STOP=1', '-U', 'mealplanner', '-d', DB_NAME, '-c', statement],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    )
      .toString()
      .trim();
  } catch {
    return null;
  }
}

/** Runs SQL against the local dev Postgres. False when there is no docker to run it with. */
export function sql(statement: string): boolean {
  return sqlQuery(statement) !== null;
}

/** Single quotes doubled, for the few values the tests put into SQL themselves. */
export const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;
