import { ADMIN_PIN, ADMIN_USER, API_URL, call, login } from './api';

/**
 * Makes sure there is an account to build every test on. On a fresh database that means running
 * the first-run setup; otherwise the admin account must already exist (run `npm run reset`).
 */
export default async function globalSetup() {
  const health = await fetch(`${API_URL}/actuator/health`).catch(() => null);
  if (!health?.ok) {
    throw new Error(`Backend is not answering at ${API_URL}. Start it with ./dev.sh start (or npm run reset).`);
  }

  const landing = await call('GET', '/api/auth/landing');
  if (landing.needsSetup) {
    await call('POST', '/api/auth/setup', {
      body: { householdName: 'E2E Home', username: ADMIN_USER, displayName: 'E2E Admin', pin: ADMIN_PIN },
    });
    return;
  }

  try {
    await login(ADMIN_USER, ADMIN_PIN);
  } catch (e) {
    throw new Error(
      `The database already has accounts but no "${ADMIN_USER}" with PIN ${ADMIN_PIN}. ` +
        'Run `npm run reset` for a clean local database, or set E2E_USER / E2E_PIN.\n' +
        String(e),
    );
  }
}
