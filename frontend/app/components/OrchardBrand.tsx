import Link from "next/link";

type OrchardBrandProps = {
  className?: string;
};

export default function OrchardBrand({ className = "" }: OrchardBrandProps) {
  return (
    <Link
      href="/"
      aria-label="Orchard home"
      className={`inline-flex min-h-11 items-center gap-3 font-serif text-[1.3rem] font-medium ${className}`}
    >
      <span
        aria-hidden="true"
        className="relative size-8 rounded-full border-[1.5px] border-current"
      >
        <span className="absolute inset-y-[6px] left-[13px] right-[13px] rounded-full border-[1.5px] border-current" />
        <span className="absolute inset-x-[6px] bottom-[13px] top-[13px] rounded-full border-[1.5px] border-current" />
      </span>
      <span>Orchard</span>
    </Link>
  );
}
