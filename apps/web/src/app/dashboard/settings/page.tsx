'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { Alert, Button, Field, Input, PageTitle, Spinner, Textarea } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { clearSessionFlag } from '@/lib/auth';
import type { TenantSettings } from '@/lib/types';

type ProfileForm = {
  name: string;
  about: string;
  address: string;
  whatsapp: string;
  timezone: string;
};

type BookingForm = {
  minNoticeMinutes: string;
  maxAdvanceDays: string;
  bufferMinutes: string;
  slotGridMinutes: string;
  cancelMinHours: string;
};

type LoyaltyForm = {
  loyaltyEnabled: boolean;
  loyaltyPointsPerReal: string;
};

export default function SettingsPage() {
  const router = useRouter();
  const { me } = useAuth();
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [profileForm, setProfileForm] = useState<ProfileForm | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  const [bookingForm, setBookingForm] = useState<BookingForm | null>(null);
  const [bookingSaving, setBookingSaving] = useState(false);
  const [bookingMsg, setBookingMsg] = useState<string | null>(null);
  const [bookingErr, setBookingErr] = useState<string | null>(null);

  const [loyaltyForm, setLoyaltyForm] = useState<LoyaltyForm | null>(null);
  const [loyaltySaving, setLoyaltySaving] = useState(false);
  const [loyaltyMsg, setLoyaltyMsg] = useState<string | null>(null);
  const [loyaltyErr, setLoyaltyErr] = useState<string | null>(null);

  function applySettings(s: TenantSettings) {
    setSettings(s);
    setProfileForm({
      name: s.name || '',
      about: s.about || '',
      address: s.address || '',
      whatsapp: s.whatsapp || '',
      timezone: s.timezone || 'America/Sao_Paulo',
    });
    setBookingForm({
      minNoticeMinutes: String(s.minNoticeMinutes),
      maxAdvanceDays: String(s.maxAdvanceDays),
      bufferMinutes: String(s.bufferMinutes),
      slotGridMinutes: String(s.slotGridMinutes),
      cancelMinHours: String(s.cancelMinHours),
    });
    setLoyaltyForm({
      loyaltyEnabled: s.loyaltyEnabled,
      loyaltyPointsPerReal: String(s.loyaltyPointsPerReal),
    });
  }

  useEffect(() => {
    void api<TenantSettings>('/api/settings')
      .then((settingsData) => {
        applySettings(settingsData);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Erro ao carregar configurações.'),
      )
      .finally(() => setLoading(false));
  }, []);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (!profileForm) return;
    setProfileSaving(true);
    setProfileMsg(null);
    setProfileErr(null);
    try {
      const updated = await api<TenantSettings>('/api/settings/profile', {
        method: 'PATCH',
        body: {
          name: profileForm.name.trim().length >= 2 ? profileForm.name.trim() : undefined,
          about: profileForm.about.trim(),
          address: profileForm.address.trim(),
          whatsapp: profileForm.whatsapp.trim(),
          timezone: profileForm.timezone.trim() || undefined,
        },
      });
      applySettings(updated);
      setProfileMsg('Perfil público atualizado.');
    } catch (err) {
      setProfileErr(err instanceof ApiError ? err.message : 'Não foi possível salvar.');
    } finally {
      setProfileSaving(false);
    }
  }

  async function saveBooking(e: FormEvent) {
    e.preventDefault();
    if (!bookingForm) return;
    setBookingSaving(true);
    setBookingMsg(null);
    setBookingErr(null);
    try {
      const updated = await api<TenantSettings>('/api/settings/booking', {
        method: 'PATCH',
        body: {
          minNoticeMinutes: Number(bookingForm.minNoticeMinutes),
          maxAdvanceDays: Number(bookingForm.maxAdvanceDays),
          bufferMinutes: Number(bookingForm.bufferMinutes),
          slotGridMinutes: Number(bookingForm.slotGridMinutes),
          cancelMinHours: Number(bookingForm.cancelMinHours),
        },
      });
      applySettings(updated);
      setBookingMsg('Regras de agendamento atualizadas.');
    } catch (err) {
      setBookingErr(err instanceof ApiError ? err.message : 'Não foi possível salvar.');
    } finally {
      setBookingSaving(false);
    }
  }

  async function saveLoyalty(e: FormEvent) {
    e.preventDefault();
    if (!loyaltyForm) return;
    setLoyaltySaving(true);
    setLoyaltyMsg(null);
    setLoyaltyErr(null);
    try {
      const updated = await api<TenantSettings>('/api/settings/loyalty', {
        method: 'PATCH',
        body: {
          loyaltyEnabled: loyaltyForm.loyaltyEnabled,
          loyaltyPointsPerReal: Number(loyaltyForm.loyaltyPointsPerReal) || 1,
        },
      });
      applySettings(updated);
      setLoyaltyMsg('Programa de fidelidade atualizado.');
    } catch (err) {
      setLoyaltyErr(err instanceof ApiError ? err.message : 'Não foi possível salvar.');
    } finally {
      setLoyaltySaving(false);
    }
  }

  async function deleteAccount() {
    if (confirmText !== 'EXCLUIR') {
      setError('Digite EXCLUIR para confirmar.');
      return;
    }
    if (deletePassword.length < 8) {
      setError('Informe sua senha atual para confirmar a exclusão.');
      return;
    }
    if (
      !confirm(
        'Esta ação apaga sua conta e dados pessoais (LGPD). Não pode ser desfeita. Continuar?',
      )
    ) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await api('/api/account', {
        method: 'DELETE',
        body: { password: deletePassword },
      });
      clearSessionFlag();
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível excluir a conta.');
      setDeleting(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <PageTitle
        title="Configurações"
        description="Perfil público, regras de agendamento, fidelidade e dados da conta."
      />
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <section className="mb-10 surface-elevated rounded-2xl p-5">
        <h2 className="font-display text-lg font-semibold text-ink">Conta</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex gap-2">
            <dt className="w-28 text-muted">Nome</dt>
            <dd className="font-medium text-ink">{me?.user?.name}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 text-muted">E-mail</dt>
            <dd className="font-medium text-ink">{me?.user?.email}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 text-muted">Negócio</dt>
            <dd className="font-medium text-ink">{settings?.name || me?.tenant?.name}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 text-muted">Slug</dt>
            <dd className="font-medium text-ink">/u/{settings?.slug || me?.tenant?.slug}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 text-muted">Plano</dt>
            <dd className="font-medium text-ink">{settings?.plan || me?.tenant?.plan}</dd>
          </div>
        </dl>
      </section>

      {profileForm ? (
        <section className="mb-10 surface-elevated rounded-2xl p-5">
          <h2 className="font-display text-lg font-semibold text-ink">Perfil público</h2>
          <p className="mt-1 text-sm text-muted">
            Informações exibidas na sua página de agendamento (/u/{settings?.slug}).
          </p>
          <form onSubmit={saveProfile} className="mt-5 space-y-4" noValidate>
            {profileErr ? <Alert>{profileErr}</Alert> : null}
            {profileMsg ? <Alert tone="success">{profileMsg}</Alert> : null}
            <Field label="Nome do negócio" id="pf-name">
              <Input
                id="pf-name"
                required
                minLength={2}
                maxLength={120}
                value={profileForm.name}
                onChange={(e) => setProfileForm((f) => (f ? { ...f, name: e.target.value } : f))}
              />
            </Field>
            <Field label="Sobre" id="pf-about" hint="Descrição curta exibida no topo da página.">
              <Textarea
                id="pf-about"
                maxLength={500}
                value={profileForm.about}
                onChange={(e) => setProfileForm((f) => (f ? { ...f, about: e.target.value } : f))}
              />
            </Field>
            <Field label="Endereço" id="pf-address">
              <Input
                id="pf-address"
                maxLength={255}
                value={profileForm.address}
                onChange={(e) => setProfileForm((f) => (f ? { ...f, address: e.target.value } : f))}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="WhatsApp" id="pf-whatsapp" hint="Com DDD, ex: 11999998888">
                <Input
                  id="pf-whatsapp"
                  type="tel"
                  maxLength={32}
                  value={profileForm.whatsapp}
                  onChange={(e) =>
                    setProfileForm((f) => (f ? { ...f, whatsapp: e.target.value } : f))
                  }
                />
              </Field>
              <Field label="Fuso horário" id="pf-timezone" hint="Ex: America/Sao_Paulo">
                <Input
                  id="pf-timezone"
                  maxLength={64}
                  value={profileForm.timezone}
                  onChange={(e) =>
                    setProfileForm((f) => (f ? { ...f, timezone: e.target.value } : f))
                  }
                />
              </Field>
            </div>
            <Button type="submit" disabled={profileSaving}>
              {profileSaving ? 'Salvando…' : 'Salvar perfil'}
            </Button>
          </form>
        </section>
      ) : null}

      {bookingForm ? (
        <section className="mb-10 surface-elevated rounded-2xl p-5">
          <h2 className="font-display text-lg font-semibold text-ink">
            Regras de agendamento
          </h2>
          <p className="mt-1 text-sm text-muted">
            Controle como os clientes podem marcar, remarcar e cancelar horários.
          </p>
          <form onSubmit={saveBooking} className="mt-5 space-y-4" noValidate>
            {bookingErr ? <Alert>{bookingErr}</Alert> : null}
            {bookingMsg ? <Alert tone="success">{bookingMsg}</Alert> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Antecedência mínima (minutos)"
                id="bk-notice"
                hint="Tempo mínimo entre o agendamento e o atendimento."
              >
                <Input
                  id="bk-notice"
                  type="number"
                  min={0}
                  max={10080}
                  required
                  value={bookingForm.minNoticeMinutes}
                  onChange={(e) =>
                    setBookingForm((f) => (f ? { ...f, minNoticeMinutes: e.target.value } : f))
                  }
                />
              </Field>
              <Field
                label="Janela máxima (dias)"
                id="bk-advance"
                hint="Quantos dias no futuro o cliente pode agendar."
              >
                <Input
                  id="bk-advance"
                  type="number"
                  min={1}
                  max={365}
                  required
                  value={bookingForm.maxAdvanceDays}
                  onChange={(e) =>
                    setBookingForm((f) => (f ? { ...f, maxAdvanceDays: e.target.value } : f))
                  }
                />
              </Field>
              <Field
                label="Intervalo entre atendimentos (minutos)"
                id="bk-buffer"
                hint="Folga automática antes e depois de cada horário."
              >
                <Input
                  id="bk-buffer"
                  type="number"
                  min={0}
                  max={120}
                  required
                  value={bookingForm.bufferMinutes}
                  onChange={(e) =>
                    setBookingForm((f) => (f ? { ...f, bufferMinutes: e.target.value } : f))
                  }
                />
              </Field>
              <Field
                label="Grade de horários (minutos)"
                id="bk-grid"
                hint="De quanto em quanto tempo os horários são oferecidos (ex: 15 em 15)."
              >
                <Input
                  id="bk-grid"
                  type="number"
                  min={5}
                  max={120}
                  required
                  value={bookingForm.slotGridMinutes}
                  onChange={(e) =>
                    setBookingForm((f) => (f ? { ...f, slotGridMinutes: e.target.value } : f))
                  }
                />
              </Field>
              <Field
                label="Prazo de cancelamento (horas)"
                id="bk-cancel"
                hint="Até quantas horas antes o cliente pode cancelar/remarcar online."
              >
                <Input
                  id="bk-cancel"
                  type="number"
                  min={0}
                  max={72}
                  required
                  value={bookingForm.cancelMinHours}
                  onChange={(e) =>
                    setBookingForm((f) => (f ? { ...f, cancelMinHours: e.target.value } : f))
                  }
                />
              </Field>
            </div>
            <Button type="submit" disabled={bookingSaving}>
              {bookingSaving ? 'Salvando…' : 'Salvar regras'}
            </Button>
          </form>
        </section>
      ) : null}

      {loyaltyForm ? (
        <section className="mb-10 surface-elevated rounded-2xl p-5">
          <h2 className="font-display text-lg font-semibold text-ink">Fidelidade</h2>
          <p className="mt-1 text-sm text-muted">
            Clientes acumulam pontos a cada atendimento concluído.
          </p>
          <form onSubmit={saveLoyalty} className="mt-5 space-y-4" noValidate>
            {loyaltyErr ? <Alert>{loyaltyErr}</Alert> : null}
            {loyaltyMsg ? <Alert tone="success">{loyaltyMsg}</Alert> : null}
            <div className="flex items-center gap-2">
              <input
                id="ly-enabled"
                type="checkbox"
                className="size-4 accent-mint-deep"
                checked={loyaltyForm.loyaltyEnabled}
                onChange={(e) =>
                  setLoyaltyForm((f) => (f ? { ...f, loyaltyEnabled: e.target.checked } : f))
                }
              />
              <label htmlFor="ly-enabled" className="text-sm font-medium text-ink-soft">
                Ativar programa de fidelidade
              </label>
            </div>
            <div className="max-w-xs">
              <Field
                label="Pontos por real gasto"
                id="ly-points"
                hint="Ex: 1 ponto por R$ 1,00 em atendimentos concluídos."
              >
                <Input
                  id="ly-points"
                  type="number"
                  min={1}
                  max={100}
                  required
                  disabled={!loyaltyForm.loyaltyEnabled}
                  value={loyaltyForm.loyaltyPointsPerReal}
                  onChange={(e) =>
                    setLoyaltyForm((f) => (f ? { ...f, loyaltyPointsPerReal: e.target.value } : f))
                  }
                />
              </Field>
            </div>
            <Button type="submit" disabled={loyaltySaving}>
              {loyaltySaving ? 'Salvando…' : 'Salvar fidelidade'}
            </Button>
          </form>
        </section>
      ) : null}

      <section className="rounded-2xl border border-danger-border bg-danger-bg p-5">
        <h2 className="font-display text-lg font-semibold text-danger-fg">Excluir conta (LGPD)</h2>
        <p className="mt-2 max-w-xl text-sm text-danger-fg/90">
          Remove permanentemente sua conta, dados do negócio e informações pessoais tratadas pela
          Agenda Pro. Agendamentos e histórico vinculados serão apagados conforme a política de
          retenção.
        </p>
        <div className="mt-4 max-w-sm space-y-3">
          <Field label="Digite EXCLUIR para confirmar" id="confirm-delete">
            <Input
              id="confirm-delete"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
            />
          </Field>
          <Field label="Senha atual" id="delete-password" hint="Reautenticação obrigatória (step-up).">
            <Input
              id="delete-password"
              type="password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
            />
          </Field>
        </div>
        <Button
          type="button"
          variant="danger"
          className="mt-4"
          disabled={deleting || confirmText !== 'EXCLUIR' || deletePassword.length < 8}
          onClick={() => void deleteAccount()}
        >
          {deleting ? 'Excluindo…' : 'Excluir minha conta'}
        </Button>
      </section>
    </div>
  );
}
