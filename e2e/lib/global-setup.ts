import { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_PIN, ADMIN_USER, API_URL, call, login } from './api';

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
    // Both ways in: the suite signs in by PIN, and the email tests need an account that has one.
    await call('POST', '/api/auth/setup', {
      body: {
        householdName: 'E2E Home',
        username: ADMIN_USER,
        displayName: 'E2E Admin',
        pin: ADMIN_PIN,
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      },
    });
    return;
  }

  try {
    const session = await login(ADMIN_USER, ADMIN_PIN);
    // A database set up before email sign-in existed: give the admin its email now.
    const me = await call('GET', '/api/users/me', { token: session.token });
    if (!me.hasPassword) {
      await call('PUT', '/api/users/me/credentials', {
        token: session.token,
        body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      });
    }
  } catch (e) {
    throw new Error(
      `The database already has accounts but no "${ADMIN_USER}" with PIN ${ADMIN_PIN}. ` +
        'Run `npm run reset` for a clean local database, or set E2E_USER / E2E_PIN.\n' +
        String(e),
    );
  }
}
