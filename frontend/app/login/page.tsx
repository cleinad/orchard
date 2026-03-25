'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Check if user is already logged in and redirect to home
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          router.push('/home');
          router.refresh();
        }
      } catch (err) {
        console.error('Error checking auth:', err);
      } finally {
        setCheckingAuth(false);
      }
    };

    checkAuth();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (isSignUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (signUpError) throw signUpError;

        if (data.user) {
          setMessage('Account created! Please check your email to verify your account.');
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) throw signInError;

        if (data.user) {
          router.push('/home');
          router.refresh();
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Show loading state while checking authentication
  if (checkingAuth) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-32 top-[-140px] h-72 w-72 rounded-full bg-stone-200/20 blur-3xl dark:bg-stone-800/15" />
          <div className="absolute bottom-[-160px] right-[-120px] h-80 w-80 rounded-full bg-stone-200/20 blur-3xl dark:bg-stone-800/20" />
        </div>
        <main className="relative mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 py-8">
          <div className="text-sm text-muted">Loading...</div>
        </main>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-[-140px] h-72 w-72 rounded-full bg-stone-200/20 blur-3xl dark:bg-stone-800/15" />
        <div className="absolute bottom-[-160px] right-[-120px] h-80 w-80 rounded-full bg-stone-200/20 blur-3xl dark:bg-stone-800/20" />
      </div>

      <main className="relative mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 py-8">
        <div className="w-full rounded-xl bg-surface p-8 shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
          <div className="mb-8 text-center">
            <h1 className="font-heading text-3xl text-foreground">
              {isSignUp ? 'Create Account' : 'Welcome Back'}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {isSignUp
                ? 'Sign up to start using Keen'
                : 'Sign in to your Keen account'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email input */}
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-medium uppercase tracking-wider text-muted"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1.5 w-full rounded-lg bg-background px-4 py-2.5 text-sm text-foreground placeholder-muted/50 outline-none ring-1 ring-black/[0.06] transition focus:ring-black/[0.12] dark:ring-white/[0.06] dark:focus:ring-white/[0.12]"
                placeholder="you@example.com"
                disabled={loading}
              />
            </div>

            {/* Password input */}
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-medium uppercase tracking-wider text-muted"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="mt-1.5 w-full rounded-lg bg-background px-4 py-2.5 text-sm text-foreground placeholder-muted/50 outline-none ring-1 ring-black/[0.06] transition focus:ring-black/[0.12] dark:ring-white/[0.06] dark:focus:ring-white/[0.12]"
                placeholder="••••••••"
                disabled={loading}
              />
            </div>

            {/* Error message */}
            {error && (
              <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-600 dark:bg-rose-900/20 dark:text-rose-400">
                {error}
              </div>
            )}

            {/* Success message */}
            {message && (
              <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                {message}
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          {/* Toggle between sign in and sign up */}
          <div className="mt-6 text-center text-sm text-muted">
            {isSignUp ? (
              <>
                Already have an account?{' '}
                <button
                  onClick={() => {
                    setIsSignUp(false);
                    setError(null);
                    setMessage(null);
                  }}
                  className="font-semibold text-foreground hover:underline"
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                Don&apos;t have an account?{' '}
                <button
                  onClick={() => {
                    setIsSignUp(true);
                    setError(null);
                    setMessage(null);
                  }}
                  className="font-semibold text-foreground hover:underline"
                >
                  Sign up
                </button>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
