import Link from "next/link";
import OrchardBrand from "./OrchardBrand";
import { buttonStyles, cx } from "./buttonStyles";

type PublicHeaderProps = {
  authPage?: "login" | "signup";
  alternateHref?: string;
};

export default function PublicHeader({
  authPage,
  alternateHref,
}: PublicHeaderProps = {}) {
  const showLogin = authPage !== "login";
  const showSignup = authPage !== "signup";

  return (
    <header className="mx-auto flex w-full max-w-[74rem] items-center justify-between px-5 py-4 sm:px-10 lg:px-12">
      <OrchardBrand className="text-[#111827]" />
      <nav aria-label="Account" className="flex items-center gap-2 sm:gap-3">
        {showLogin ? (
          <Link
            href={
              authPage === "signup" && alternateHref ? alternateHref : "/login"
            }
            className={cx(
              "inline-flex h-9 items-center justify-center rounded-lg px-2.5 font-sans text-[13px] font-medium text-[#28303d] hover:text-[#111827] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111827]",
              buttonStyles.transition,
            )}
          >
            Log in
          </Link>
        ) : null}
        {showSignup ? (
          <Link
            href={
              authPage === "login" && alternateHref ? alternateHref : "/signup"
            }
            className={cx(
              "inline-flex h-9 items-center justify-center rounded-lg bg-[#3749ad] px-3.5 font-sans text-[13px] font-medium text-white hover:bg-[#2f3f96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3749ad]",
              buttonStyles.transition,
            )}
          >
            Sign up
          </Link>
        ) : null}
      </nav>
    </header>
  );
}
