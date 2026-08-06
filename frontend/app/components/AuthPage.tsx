"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getSafeRedirectPath } from "@/lib/auth-redirect";
import landingFruitApple from "../assets/landing-fruit-apple-collage.jpg";
import landingFruitPeach from "../assets/landing-fruit-peach-collage.jpg";
import PublicHeader from "./PublicHeader";
import { buttonStyles, cx } from "./buttonStyles";

const inputClassName =
  "mt-2 h-11 w-full rounded-lg border border-[#d8dee8] bg-white/75 px-3.5 font-sans text-[15px] text-[#111827] outline-none transition-colors placeholder:text-[#9aa3b1] focus:border-[#3749ad]/55 focus:bg-white focus:ring-2 focus:ring-[#3749ad]/12 disabled:cursor-not-allowed disabled:opacity-60";

function AuthFrame({
  children,
  initialSignUp,
  alternateHref,
}: {
  children: React.ReactNode;
  initialSignUp: boolean;
  alternateHref: string;
}) {
  return (
    <div
      className={`flex min-h-[100dvh] flex-col text-[#111827] ${
        initialSignUp
          ? "bg-[linear-gradient(160deg,#f7f9fc_0%,#f7f4f5_48%,#f7eef1_100%)]"
          : "bg-[linear-gradient(160deg,#f7f9fc_0%,#eef1f8_48%,#e5e9f6_100%)]"
      }`}
      style={{ colorScheme: "light" }}
    >
      <PublicHeader
        authPage={initialSignUp ? "signup" : "login"}
        alternateHref={alternateHref}
      />
      <main className="mx-auto flex w-full max-w-[74rem] flex-1 items-center px-5 pb-10 pt-5 sm:px-10 sm:pb-14 sm:pt-8 lg:px-12">
        {children}
      </main>
    </div>
  );
}

type AuthPageProps = {
  initialSignUp?: boolean;
};

export default function AuthPage({ initialSignUp = false }: AuthPageProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [redirectPath, setRedirectPath] = useState("/home");

  useEffect(() => {
    const nextRedirectPath = getSafeRedirectPath(
      new URLSearchParams(window.location.search).get("redirect"),
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
        console.error("Error checking auth:", err);
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
            "Account created. Please check your email to verify your address.",
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
        err instanceof Error
          ? err.message
          : "An error occurred. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const heading = initialSignUp ? "Sign up" : "Welcome back";
  const submitLabel = loading
    ? "Please wait..."
    : initialSignUp
      ? "Create account"
      : "Sign in";
  const alternateHref = initialSignUp
    ? `/login?redirect=${encodeURIComponent(redirectPath)}`
    : `/signup?redirect=${encodeURIComponent(redirectPath)}`;

  if (checkingAuth) {
    return (
      <AuthFrame initialSignUp={initialSignUp} alternateHref={alternateHref}>
        <div className="mx-auto w-full max-w-[27rem]">
          <p className="font-sans text-sm text-[#687385]">Loading...</p>
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame initialSignUp={initialSignUp} alternateHref={alternateHref}>
      <div className="grid w-full items-center gap-8 py-4 sm:gap-10 lg:grid-cols-[1.14fr_0.86fr] lg:gap-16 lg:py-10">
        <div
          aria-hidden="true"
          className="relative h-36 overflow-hidden rounded-[1.4rem] shadow-[0_28px_70px_-40px_rgba(24,33,58,0.5)] sm:h-52 sm:rounded-[1.75rem] lg:h-auto lg:aspect-[5/4]"
        >
          <Image
            src={initialSignUp ? landingFruitPeach : landingFruitApple}
            alt=""
            fill
            priority
            sizes="(max-width: 1024px) calc(100vw - 2.5rem), 39rem"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-[#3749ad]/[0.025]" />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#dfe5ec]/35 to-transparent" />
        </div>

        <section className="mx-auto w-full max-w-[27rem] lg:mx-0">
          <div>
            <h1 className="text-balance font-serif text-[clamp(2rem,4.5vw,2.65rem)] font-normal leading-[0.98] tracking-[-0.02em] text-[#111827]">
              {heading}
            </h1>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label
                htmlFor="email"
                className="block font-sans text-xs font-medium text-[#5f6875]"
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
                className="block font-sans text-xs font-medium text-[#5f6875]"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete={
                  initialSignUp ? "new-password" : "current-password"
                }
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
                className="rounded-lg border border-[#e8c5cd] bg-[#fbeff2] px-4 py-3 font-sans text-sm text-[#8a3549]"
              >
                {error}
              </div>
            ) : null}

            {message ? (
              <div
                role="status"
                className="rounded-lg border border-[#cadbbd] bg-[#f0f6ea] px-4 py-3 font-sans text-sm text-[#446234]"
              >
                {message}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className={cx(
                "h-11 w-full rounded-lg bg-[#3749ad] px-4 font-sans text-sm font-medium text-white hover:bg-[#2f3f96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3749ad] disabled:cursor-not-allowed disabled:opacity-55",
                buttonStyles.transition,
              )}
            >
              {submitLabel}
            </button>
          </form>

          <p className="mt-6 font-sans text-sm text-[#687385]">
            {initialSignUp
              ? "Already have an account?"
              : "Don't have an account?"}{" "}
            <Link
              href={alternateHref}
              className="font-medium text-[#3749ad] underline decoration-[#3749ad]/25 underline-offset-4 transition hover:decoration-[#3749ad]/70 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#3749ad]"
            >
              {initialSignUp ? "Sign in" : "Sign up"}
            </Link>
          </p>
        </section>
      </div>
    </AuthFrame>
  );
}
