'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  PageTitle,
  Spinner,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import type { TeamMember } from '@/lib/types';

type CreateForm = {
  name: string;
  email: string;
  password: string;
  phone: string;
  commissionPercent: string;
};

const emptyCreateForm: CreateForm = {
  name: '',
  email: '',
  password: '',
  phone: '',
  commissionPercent: '0',
};

type EditForm = {
  name: string;
  phone: string;
  commissionPercent: string;
  isActive: boolean;
};

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreateForm);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  async function load() {
    const data = await api<TeamMember[]>('/api/team');
    setMembers(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    void load()
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Erro ao carregar equipe.'))
      .finally(() => setLoading(false));
  }, []);

  async function submitCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    setSuccess(null);
    try {
      await api('/api/team', {
        method: 'POST',
        body: {
          name: createForm.name.trim(),
          email: createForm.email.trim(),
          password: createForm.password,
          phone: createForm.phone.trim() || undefined,
          commissionPercent: Number(createForm.commissionPercent) || 0,
        },
      });
      setCreateOpen(false);
      setCreateForm(emptyCreateForm);
      setSuccess('Profissional adicionado.');
      await load();
    } catch (err) {
      // 409 (limite do plano / e-mail duplicado) e 403 vêm com mensagem da API
      setCreateError(err instanceof ApiError ? err.message : 'Não foi possível adicionar.');
    } finally {
      setCreating(false);
    }
  }

  function startEdit(member: TeamMember) {
    setEditing(member);
    setEditForm({
      name: member.name,
      phone: member.phone || '',
      commissionPercent: String(member.commissionPercent),
      isActive: member.isActive,
    });
    setEditError(null);
  }

  async function submitEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing || !editForm) return;
    setSavingEdit(true);
    setEditError(null);
    setSuccess(null);
    try {
      await api(`/api/team/${editing.id}`, {
        method: 'PATCH',
        body: {
          name: editForm.name.trim(),
          phone: editForm.phone.trim() || undefined,
          commissionPercent: Number(editForm.commissionPercent) || 0,
          ...(editing.role === 'OWNER' ? {} : { isActive: editForm.isActive }),
        },
      });
      setEditing(null);
      setSuccess('Profissional atualizado.');
      await load();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Não foi possível salvar.');
    } finally {
      setSavingEdit(false);
    }
  }

  async function remove(member: TeamMember) {
    if (!confirm(`Remover ${member.name} da equipe? O histórico de atendimentos é preservado.`)) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await api(`/api/team/${member.id}`, { method: 'DELETE' });
      setSuccess('Profissional removido.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível remover.');
    }
  }

  if (loading) return <Spinner label="Carregando equipe…" />;

  return (
    <div className="animate-fade-up">
      <PageTitle
        title="Equipe"
        description="Quem atende no negócio e a comissão de cada um."
      />

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {success ? (
        <div className="mb-4">
          <Alert tone="success">{success}</Alert>
        </div>
      ) : null}

      <div className="mb-6">
        <Button type="button" onClick={() => setCreateOpen(true)}>
          Adicionar profissional
        </Button>
      </div>

      {members.length === 0 ? (
        <EmptyState
          title="Nenhum profissional ainda"
          action={
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(true)}>
              Adicionar o primeiro
            </Button>
          }
        >
          Cadastre quem atende para aparecer na página pública e receber horários.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex flex-col gap-3 surface-elevated rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                  {m.name}
                  <Badge tone={m.role === 'OWNER' ? 'emerald' : 'stone'}>
                    {m.role === 'OWNER' ? 'Dono' : 'Equipe'}
                  </Badge>
                  {!m.isActive ? <Badge tone="red">Inativo</Badge> : null}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {m.email}
                  {m.phone ? ` · ${m.phone}` : ''}
                </p>
                <p className="mt-1 text-sm text-muted">Comissão: {m.commissionPercent}%</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => startEdit(m)}>
                  Editar
                </Button>
                {m.role !== 'OWNER' ? (
                  <Button type="button" variant="danger" onClick={() => void remove(m)}>
                    Remover
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {createOpen ? (
        <Modal title="Adicionar profissional" onClose={() => setCreateOpen(false)}>
          <form onSubmit={submitCreate} className="space-y-4" noValidate>
            {createError ? <Alert>{createError}</Alert> : null}
            <Field label="Nome" id="tm-name">
              <Input
                id="tm-name"
                required
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Field>
            <Field label="E-mail" id="tm-email" hint="Será o login do profissional.">
              <Input
                id="tm-email"
                type="email"
                required
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
              />
            </Field>
            <Field label="Senha inicial" id="tm-password" hint="Mínimo de 8 caracteres.">
              <Input
                id="tm-password"
                type="password"
                required
                minLength={8}
                value={createForm.password}
                onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
              />
            </Field>
            <Field label="Telefone (opcional)" id="tm-phone">
              <Input
                id="tm-phone"
                type="tel"
                value={createForm.phone}
                onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </Field>
            <Field
              label="Comissão (%)"
              id="tm-commission"
              hint="Percentual sobre os atendimentos concluídos."
            >
              <Input
                id="tm-commission"
                type="number"
                min={0}
                max={100}
                value={createForm.commissionPercent}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, commissionPercent: e.target.value }))
                }
              />
            </Field>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button type="submit" disabled={creating}>
                {creating ? 'Adicionando…' : 'Adicionar'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editing && editForm ? (
        <Modal title={`Editar ${editing.name}`} onClose={() => setEditing(null)}>
          <form onSubmit={submitEdit} className="space-y-4" noValidate>
            {editError ? <Alert>{editError}</Alert> : null}
            <Field label="Nome" id="edit-name">
              <Input
                id="edit-name"
                required
                value={editForm.name}
                onChange={(e) => setEditForm((f) => (f ? { ...f, name: e.target.value } : f))}
              />
            </Field>
            <Field label="Telefone" id="edit-phone">
              <Input
                id="edit-phone"
                type="tel"
                value={editForm.phone}
                onChange={(e) => setEditForm((f) => (f ? { ...f, phone: e.target.value } : f))}
              />
            </Field>
            <Field label="Comissão (%)" id="edit-commission">
              <Input
                id="edit-commission"
                type="number"
                min={0}
                max={100}
                value={editForm.commissionPercent}
                onChange={(e) =>
                  setEditForm((f) => (f ? { ...f, commissionPercent: e.target.value } : f))
                }
              />
            </Field>
            {editing.role !== 'OWNER' ? (
              <div className="flex items-center gap-2">
                <input
                  id="edit-active"
                  type="checkbox"
                  className="size-4 accent-mint-deep"
                  checked={editForm.isActive}
                  onChange={(e) =>
                    setEditForm((f) => (f ? { ...f, isActive: e.target.checked } : f))
                  }
                />
                <label htmlFor="edit-active" className="text-sm font-medium text-ink-soft">
                  Ativo (aparece na página pública e recebe agendamentos)
                </label>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button type="submit" disabled={savingEdit}>
                {savingEdit ? 'Salvando…' : 'Salvar alterações'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
