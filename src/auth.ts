import { getApps, initializeApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type Auth, type User } from 'firebase/auth';

const calendarScope = 'https://www.googleapis.com/auth/calendar.events.owned';
let auth: Auth | null = null;

export function googleProvider(withCalendar: boolean): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  if (withCalendar) provider.addScope(calendarScope);
  return provider;
}

export function watchAccount(config: FirebaseOptions, onChange: (user: User | null) => void): () => void {
  const appName = 'diao-tham-account';
  const existing = getApps().find(app => app.name === appName);
  const app = existing || initializeApp(config, appName);
  auth = getAuth(app);
  return onAuthStateChanged(auth, onChange);
}

/** The Google access token is kept only in memory by calendar.ts. */
export async function signInGoogle(withCalendar: boolean): Promise<{ user: User; calendarToken: string | null }> {
  if (!auth) throw new Error('Google sign-in is not configured yet.');
  const result = await signInWithPopup(auth, googleProvider(withCalendar));
  const credential = GoogleAuthProvider.credentialFromResult(result);
  return { user: result.user, calendarToken: withCalendar ? credential?.accessToken || null : null };
}

export async function signOutGoogle(): Promise<void> {
  if (auth) await signOut(auth);
}
