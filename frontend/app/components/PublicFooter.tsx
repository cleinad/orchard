import Link from "next/link";
import OrchardBrand from "./OrchardBrand";
import { buttonStyles, cx } from "./buttonStyles";

const footerLinks = [
  { href: "/roadmap", label: "Roadmap" },
  { href: "/login", label: "Log in" },
  { href: "/signup", label: "Sign up" },
] as const;

type PublicFooterProps = {
  tone?: "light" | "dark";
};

export default function PublicFooter({ tone = "light" }: PublicFooterProps) {
  const isDark = tone === "dark";

  return (
    <footer
      className={isDark ? "border-t border-white/15" : "border-t border-[#e5e7eb]"}
    >
      <div
        className={cx(
          "flex w-full flex-col gap-6 py-7 font-sans text-[13px] sm:flex-row sm:items-end sm:justify-between",
          !isDark && "mx-auto max-w-[74rem] px-5 text-[#6b7280] sm:px-10 lg:px-12"
        )}
      >
        <div>
          <OrchardBrand
            className={isDark ? "text-white" : "text-[#111827]"}
          />
          <p className={cx("mt-1", isDark ? "text-white/50" : "text-[#6b7280]")}>
            © {new Date().getFullYear()} Orchard
          </p>
        </div>
        <nav aria-label="Footer" className="flex items-center gap-5">
          {footerLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cx(
                "inline-flex min-h-9 items-center focus-visible:outline-2 focus-visible:outline-offset-2",
                isDark
                  ? "text-white/65 hover:text-white focus-visible:outline-white"
                  : "text-[#4b5563] hover:text-[#111827] focus-visible:outline-[#111827]",
                buttonStyles.transition
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
