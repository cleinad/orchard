'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getSafeRedirectPath } from '@/lib/auth-redirect';
import { marketingBackdropStyle } from '@/lib/marketing-backdrop';

const inputClassName =
  'mt-1.5 w-full rounded-[1.1rem] border border-black/10 bg-white/78 px-4 py-[0.72rem] text-[15px] text-[#142033] outline-none transition placeholder:text-[#93a0b2] focus:border-black/15 focus:bg-white focus:ring-4 focus:ring-[#dfeaf7] disabled:cursor-not-allowed disabled:opacity-60';

function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-[100dvh] text-[#142033]" style={{ colorScheme: 'light' }}>
      <div aria-hidden="true" style={marketingBackdropStyle} />

      <div className="relative z-10 flex min-h-[100dvh] flex-col px-6 pb-10 pt-7 sm:px-10 sm:pt-9 lg:px-14">
        <header className="flex w-full items-center">
          <Link
            href="/"
            className="font-heading text-[1.4rem] tracking-[-0.04em] text-[#142033]"
          >
            Keen
          </Link>
        </header>

        <main className="flex flex-1 items-center justify-center">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [redirectPath, setRedirectPath] = useState('/home');

  useEffect(() => {
    const nextRedirectPath = getSafeRedirectPath(
      new URLSearchParams(window.location.search).get('redirect')
    );
    setRedirectPath(nextRedirectPath);

    const checkAuth = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) {
          router.replace(nextRedirectPath);
          router.refresh();
        }
      } catch (err) {
        console.error('Error checking auth:', err);
      } finally {
        setCheckingAuth(false);
      }
    };

    void checkAuth();
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

        if (data.session) {
          router.replace(redirectPath);
          router.refresh();
          return;
        }

        if (data.user) {
          setMessage(
            'Account created. Please check your email to verify your address.'
          );
        }
      } else {
        const { data, error: signInError } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          });

        if (signInError) throw signInError;

        if (data.user) {
          router.replace(redirectPath);
          router.refresh();
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const heading = isSignUp ? 'Create your account' : 'Welcome back';
  const supportingCopy = isSignUp
    ? 'Create an account to start exploring with Keen.'
    : 'Sign in to continue your research.';
  const submitLabel = loading
    ? 'Please wait...'
    : isSignUp
      ? 'Create account'
      : 'Sign in';

  if (checkingAuth) {
    return (
      <AuthFrame>
        <div className="w-full max-w-[26rem]">
          <p className="text-sm text-[#627289]">Loading...</p>
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
      <section className="w-full max-w-[26rem]">
        <div>
          <h1 className="font-heading text-[clamp(2.7rem,8vw,4.1rem)] leading-[0.95] tracking-[-0.06em] text-[#142033]">
            {heading}
          </h1>
          <p className="mt-4 max-w-md pl-[2px] text-[1.02rem] leading-[1.65] text-[#627289]">
            {supportingCopy}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-10 space-y-5">
          <div>
            <label
              htmlFor="email"
              className="block pl-px text-[12px] font-medium text-[#6f7f93]"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              disabled={loading}
              className={inputClassName}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block pl-px text-[12px] font-medium text-[#6f7f93]"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="••••••••"
              disabled={loading}
              className={inputClassName}
            />
          </div>

          {error ? (
            <div className="rounded-[1.1rem] border border-rose-200/80 bg-rose-50/90 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          {message ? (
            <div className="rounded-[1.1rem] border border-emerald-200/80 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-700">
              {message}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-[#162236] px-4 py-3.5 text-sm font-medium text-white transition hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {submitLabel}
          </button>
        </form>

        <p className="mt-6 text-sm text-[#79889b]">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            type="button"
            onClick={() => {
              setIsSignUp((current) => !current);
              setError(null);
              setMessage(null);
            }}
            className="text-[#142033] underline decoration-black/12 underline-offset-4 transition hover:decoration-black/35"
          >
            {isSignUp ? 'Sign in' : 'Sign up'}
          </button>
        </p>
      </section>
    </AuthFrame>
  );
}
