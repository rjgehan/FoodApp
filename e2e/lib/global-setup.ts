import { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_PIN, ADMIN_USER, API_URL, call, login } from './api';

/** The admin's own household, from the first-run setup. */
const HOME = 'E2E Home';

/**
 * The admin's home keeps a cupboard, plans meals and has had its kitchen set up, as every
 * household `newHousehold()` makes does — a household fresh from the setup has the cupboard off
 * and its kitchen questions waiting, and the tests that land in it expect the old world.
 */
async function setUpHome(token: string, householdId: string | null | undefined) {
  if (!householdId) return;
  await call('PATCH', `/api/households/${householdId}/kitchen`, {
    token,
    body: { cupboardEnabled: true, planEnabled: true, setUp: true },
  });
}

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
    const auth = await call('POST', '/api/auth/setup', {
      body: {
        householdName: HOME,
        username: ADMIN_USER,
        displayName: 'E2E Admin',
        pin: ADMIN_PIN,
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      },
    });
    await setUpHome(auth.token, auth.lastHouseholdId);
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
    // A database from before households had a kitchen: its home is set up the same way.
    const households: { id: string; name: string; kitchenSetUp?: boolean }[] = await call('GET', '/api/households', {
      token: session.token,
    });
    const home = households.find((h) => h.name === HOME && h.kitchenSetUp === false);
    await setUpHome(session.token, home?.id);
  } catch (e) {
    throw new Error(
      `The database already has accounts but no "${ADMIN_USER}" with PIN ${ADMIN_PIN}. ` +
        'Run `npm run reset` for a clean local database, or set E2E_USER / E2E_PIN.\n' +
        String(e),
    );
  }
}
