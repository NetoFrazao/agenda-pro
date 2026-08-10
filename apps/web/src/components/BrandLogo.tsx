import Link from 'next/link';

type BrandLogoProps = {
  href?: string;
  size?: 'sm' | 'lg' | 'hero';
  className?: string;
  tone?: 'light' | 'dark';
};

const sizeClass = {
  sm: 'text-lg',
  lg: 'text-2xl',
  hero: 'text-5xl sm:text-6xl md:text-7xl',
};

export function BrandLogo({
  href = '/',
  size = 'sm',
  className = '',
  tone = 'light',
}: BrandLogoProps) {
  const base = tone === 'dark' ? 'text-white' : 'text-ink';
  const accent = tone === 'dark' ? 'text-mint' : 'text-mint-deep';
  const content = (
    <span
      className={`font-display font-bold tracking-tight ${base} ${sizeClass[size]} ${className}`}
    >
      Agenda<span className={accent}>Pro</span>
    </span>
  );

  if (!href) return content;
  return (
    <Link
      href={href}
      aria-label="Agenda Pro"
      className="focus-ring inline-block rounded-sm no-underline transition hover:opacity-90"
    >
      {content}
    </Link>
  );
}
