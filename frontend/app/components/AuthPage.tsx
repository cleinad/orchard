'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getSafeRedirectPath } from '@/lib/auth-redirect';
import orchardDuskBackdrop from '../assets/orchard-dusk-backdrop.png';
import OrchardBrand from './OrchardBrand';

const inputClassName =
  'mt-2 min-h-12 w-full rounded-lg border border-white/15 bg-white/10 px-4 font-sans text-[15px] text-white outline-none transition placeholder:text-white/65 focus:border-white/35 focus:bg-white/14 focus:ring-2 focus:ring-white/20 disabled:cursor-not-allowed disabled:opacity-60';

function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative min-h-[100dvh] overflow-hidden bg-[#111411] text-white"
      style={{ colorScheme: 'dark' }}
    >
      <Image
        src={orchardDuskBackdrop}
        alt=""
        fill
        priority
        sizes="100vw"
        className="scale-[1.01] object-cover object-center"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,10,7,0.38),rgba(7,10,7,0.28)_42%,rgba(7,10,7,0.68)),linear-gradient(90deg,rgba(7,10,7,0.36),transparent_45%,rgba(7,10,7,0.24))]"
      />

      <div className="relative z-10 flex min-h-[100dvh] flex-col px-5 pb-8 pt-5 sm:px-10 sm:pb-10 sm:pt-8 lg:px-14">
        <header className="flex w-full items-center">
          <OrchardBrand className="text-white" />
        </header>

        <main className="flex flex-1 items-center justify-center py-10">
          {children}
        </main>
      </div>
    </div>
  );
}

type AuthPageProps = {
  initialSignUp?: boolean;
};

export default function AuthPage({ initialSignUp = false }: AuthPageProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (initialSignUp) {
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
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'An error occurred. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const heading = initialSignUp ? 'Create your account' : 'Welcome back';
  const supportingCopy = initialSignUp
    ? 'Create an account and give your ideas room to grow.'
    : 'Sign in to continue your research.';
  const submitLabel = loading
    ? 'Please wait...'
    : initialSignUp
      ? 'Create account'
      : 'Sign in';
  const alternateHref = initialSignUp
    ? `/login?redirect=${encodeURIComponent(redirectPath)}`
    : `/signup?redirect=${encodeURIComponent(redirectPath)}`;

  if (checkingAuth) {
    return (
      <AuthFrame>
        <div className="w-full max-w-[27rem]">
          <p className="font-sans text-sm text-white/65">Loading...</p>
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
      <section className="w-full max-w-[27rem] rounded-lg border border-white/15 bg-[#101410]/72 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:p-8">
        <div>
          <h1 className="text-balance font-serif text-[clamp(2.7rem,8vw,3.8rem)] font-normal leading-[0.92] text-white">
            {heading}
          </h1>
          <p className="mt-4 max-w-md font-sans text-[1rem] leading-[1.6] text-white/68">
            {supportingCopy}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label
              htmlFor="email"
              className="block font-sans text-xs font-medium text-white/65"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              placeholder="you@example.com"
              disabled={loading}
              className={inputClassName}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block font-sans text-xs font-medium text-white/65"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete={initialSignUp ? 'new-password' : 'current-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
              placeholder="••••••••"
              disabled={loading}
              className={inputClassName}
            />
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-rose-300/25 bg-rose-950/55 px-4 py-3 font-sans text-sm text-rose-100"
            >
              {error}
            </div>
          ) : null}

          {message ? (
            <div
              role="status"
              className="rounded-lg border border-emerald-300/25 bg-emerald-950/55 px-4 py-3 font-sans text-sm text-emerald-100"
            >
              {message}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="min-h-12 w-full rounded-lg border border-[#27573e] bg-[#27573e] px-4 font-sans text-sm font-medium text-white transition hover:-translate-y-px hover:bg-[#31684b] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transform-none"
          >
            {submitLabel}
          </button>
        </form>

        <p className="mt-6 font-sans text-sm text-white/58">
          {initialSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <Link
            href={alternateHref}
            className="text-white underline decoration-white/25 underline-offset-4 transition hover:decoration-white/70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            {initialSignUp ? 'Sign in' : 'Sign up'}
          </Link>
        </p>
      </section>
    </AuthFrame>
  );
}
