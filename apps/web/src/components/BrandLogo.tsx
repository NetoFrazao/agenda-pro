import Link from 'next/link';

type BrandLogoProps = {
  href?: string;
  size?: 'sm' | 'lg' | 'hero';
  className?: string;
};

const sizeClass = {
  sm: 'text-lg',
  lg: 'text-2xl',
  hero: 'text-5xl sm:text-6xl md:text-7xl',
};

export function BrandLogo({ href = '/', size = 'sm', className = '' }: BrandLogoProps) {
  const content = (
    <span
      className={`font-display font-semibold tracking-tight text-stone-900 ${sizeClass[size]} ${className}`}
    >
      Agenda <span className="text-emerald-700">Pro</span>
    </span>
  );

  if (!href) return content;
  return (
    <Link href={href} className="inline-block no-underline hover:opacity-90">
      {content}
    </Link>
  );
}
