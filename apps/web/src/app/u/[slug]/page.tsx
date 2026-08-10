import type { Metadata } from 'next';
import { getApiBaseUrl } from '@/lib/api';
import type { PublicTenantProfile } from '@/lib/types';
import { PublicBookingClient } from './PublicBookingClient';

type PageProps = { params: Promise<{ slug: string }> };

async function fetchPublicProfile(slug: string): Promise<PublicTenantProfile | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/public/${encodeURIComponent(slug)}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return (await res.json()) as PublicTenantProfile;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const profile = await fetchPublicProfile(slug);
  if (!profile) {
    return {
      title: 'Agendamento | Agenda Pro',
      description: 'Página de agendamento online.',
    };
  }
  const title = `Agendar com ${profile.name}`;
  const description =
    profile.about?.trim() ||
    `Agende online com ${profile.name}. Escolha serviço, horário e confirme em poucos passos.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
    },
  };
}

export default async function PublicBookingPage({ params }: PageProps) {
  const { slug } = await params;
  return <PublicBookingClient slug={slug} />;
}
