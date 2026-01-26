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
          // User is already logged in, redirect to home
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
        // Sign up new user
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (signUpError) throw signUpError;

        if (data.user) {
          setMessage('Account created! Please check your email to verify your account.');
        }
      } else {
        // Sign in existing user
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) throw signInError;

        if (data.user) {
          // Redirect to home page on successful login
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
      <div className="relative min-h-screen overflow-hidden bg-[#fbfaf7] text-slate-950 dark:bg-[#060606] dark:text-slate-100">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-32 top-[-140px] h-72 w-72 rounded-full bg-sky-200/40 blur-3xl dark:bg-sky-400/30" />
          <div className="absolute bottom-[-160px] right-[-120px] h-80 w-80 rounded-full bg-emerald-200/40 blur-3xl dark:bg-emerald-400/30" />
        </div>
        <main className="relative mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 py-8">
          <div className="text-sm text-slate-600 dark:text-slate-400">Loading...</div>
        </main>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#fbfaf7] text-slate-950 dark:bg-[#060606] dark:text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-[-140px] h-72 w-72 rounded-full bg-sky-200/40 blur-3xl dark:bg-sky-400/30" />
        <div className="absolute bottom-[-160px] right-[-120px] h-80 w-80 rounded-full bg-emerald-200/40 blur-3xl dark:bg-emerald-400/30" />
      </div>

      <main className="relative mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 py-8">
        <div className="w-full rounded-2xl border border-slate-200/70 bg-white/80 p-8 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
          <div className="mb-8 text-center">
            <h1 className="font-heading text-3xl font-semibold text-slate-950 dark:text-white">
              {isSignUp ? 'Create Account' : 'Welcome Back'}
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              {isSignUp
                ? 'Sign up to start using Novus'
                : 'Sign in to your Novus account'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email input */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 shadow-sm transition focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-slate-600"
                placeholder="you@example.com"
                disabled={loading}
              />
            </div>

            {/* Password input */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300"
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
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 shadow-sm transition focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-slate-600"
                placeholder="••••••••"
                disabled={loading}
              />
            </div>

            {/* Error message */}
            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
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
              className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          {/* Toggle between sign in and sign up */}
          <div className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
            {isSignUp ? (
              <>
                Already have an account?{' '}
                <button
                  onClick={() => {
                    setIsSignUp(false);
                    setError(null);
                    setMessage(null);
                  }}
                  className="font-semibold text-slate-900 hover:underline dark:text-slate-100"
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                Don't have an account?{' '}
                <button
                  onClick={() => {
                    setIsSignUp(true);
                    setError(null);
                    setMessage(null);
                  }}
                  className="font-semibold text-slate-900 hover:underline dark:text-slate-100"
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
