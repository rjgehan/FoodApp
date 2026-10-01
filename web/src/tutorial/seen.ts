/*
 Whether this device has had the first-run tutorial. Once per device, ever: finishing it or
 skipping it both count, and so does already being signed in when the update that brought it
 arrives — somebody who has been using the app for months is not shown how to use it.
*/

const SEEN_KEY = 'mp_tutorialSeen';

export function tutorialSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    // Storage blocked (a private window): showing it every time would be worse than never.
    return true;
  }
}

export function markTutorialSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Nothing to remember it in; tutorialSeen() already says yes in that case.
  }
}

/**
 * Called once before the first render. A session already on the device means this person was
 * signed in before the tutorial existed (or has been through it), so it is marked seen now — a
 * later sign-out must not bring it up either.
 */
export function settleTutorial() {
  try {
    if (localStorage.getItem('mp_token')) markTutorialSeen();
  } catch {
    // Unreadable storage: tutorialSeen() reads it as seen.
  }
}
