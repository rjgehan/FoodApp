import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import { Button, Input, Label } from '../components/Card';

export default function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') await login(username, password);
      else await register(username, password, displayName);
    } catch (err) {
      setError(err instanceof ApiError ? describeError(err) : 'Something went wrong. Is the backend running?');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <h1 className="text-xl font-semibold mb-1">Meal Planner</h1>
        <p className="text-sm text-slate-500 mb-5">{mode === 'login' ? 'Log in to continue' : 'Create an account'}</p>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label>Username</Label>
            <Input required value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          {mode === 'register' && (
            <div>
              <Label>Display name</Label>
              <Input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
          )}
          <div>
            <Label>Password</Label>
            <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <Button type="submit" disabled={busy} className="w-full justify-center">
            {mode === 'login' ? 'Log in' : 'Register'}
          </Button>
        </form>

        <button
          className="mt-4 text-sm text-slate-500 hover:underline"
          onClick={() => {
            setError(null);
            setMode(mode === 'login' ? 'register' : 'login');
          }}
        >
          {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Log in'}
        </button>
      </div>
    </div>
  );
}

function describeError(err: ApiError): string {
  if (err.status === 401) return 'Invalid username or password.';
  if (err.status === 409) return 'That username is already taken.';
  const body = err.body as { message?: string } | null;
  return body?.message ?? 'Something went wrong.';
}
