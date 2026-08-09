/** Tipos alinhados ao contrato da API Agenda Pro. */

export type PlanCode = 'STARTER' | 'PRO' | 'BUSINESS';

export type AppointmentStatus =
  'PENDING_PAYMENT' | 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export type UserRole = 'OWNER' | 'MEMBER';

export type PixChargeStatus = 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED';

export type WaitlistEntryStatus = 'WAITING' | 'NOTIFIED';

export interface User {
  id: string;
  name: string;
  email: string;
  role?: string;
  timezone?: string | null;
  phone?: string | null;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  plan: PlanCode;
}

export interface AuthUserPayload {
  user: User;
  tenant: Tenant;
}

/** Tokens ainda vêm no body, mas a sessão real vive em cookies httpOnly. */
export interface LoginResponse {
  accessToken?: string;
  refreshToken?: string;
  user: User;
  tenant?: Tenant;
}

export interface Service {
  id: string;
  name: string;
  description?: string | null;
  durationMinutes: number;
  priceCents: number;
  depositCents?: number;
  isActive: boolean;
  sortOrder?: number;
}

export interface AvailabilityRule {
  id: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  isActive: boolean;
  professionalId?: string | null;
}

export interface AvailabilityException {
  id: string;
  /** Data em ISO (meia-noite UTC) — use os 10 primeiros caracteres. */
  date: string;
  isAvailable: boolean;
  startMinute?: number | null;
  endMinute?: number | null;
  reason?: string | null;
  professionalId?: string | null;
}

export interface ClientSummary {
  id?: string;
  name: string;
  phone: string;
  email?: string | null;
}

export interface PixChargeSummary {
  status: PixChargeStatus;
  amountCents: number;
}

export interface PixChargeDetail extends PixChargeSummary {
  copyPaste: string;
  qrCodeBase64: string;
  expiresAt: string | null;
}

export interface Appointment {
  id: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  customerNotes?: string | null;
  service?: Service | null;
  client?: ClientSummary | null;
  professional?: { id: string; name: string } | null;
  pixCharge?: PixChargeSummary | null;
  priceCentsSnapshot?: number;
  durationMinutesSnapshot?: number;
}

export interface PlanDefinition {
  code: PlanCode;
  name: string;
  description?: string | null;
  monthlyBookingLimit?: number | null;
  maxProfessionals?: number;
  whatsappReminders?: boolean;
  pixDepositEnabled?: boolean;
  /** Preço mensal em centavos, se a API enviar; senão usamos placeholders. */
  priceCentsMonthly?: number | null;
}

export interface PublicProfessional {
  id: string;
  name: string;
  role: UserRole;
}

export interface PublicReview {
  rating: number;
  comment?: string | null;
  clientName?: string | null;
  createdAt: string;
}

export interface PublicTenantProfile {
  name: string;
  slug: string;
  timezone?: string;
  about?: string | null;
  address?: string | null;
  whatsapp?: string | null;
  maxAdvanceDays?: number;
  services: Service[];
  professionals: PublicProfessional[];
  rating: { average: number | null; count: number };
  reviews: PublicReview[];
}

export interface PublicSlotsResponse {
  date?: string;
  timezone?: string;
  serviceId?: string;
  professionalId?: string;
  slots: string[];
}

export interface BookAppointmentPayload {
  serviceId: string;
  professionalId?: string;
  startsAt: string;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  notes?: string;
}

export interface PixPaymentInfo {
  copyPaste: string;
  qrCodeBase64: string;
  ticketUrl?: string | null;
  amountCents: number;
  expiresAt?: string | null;
}

export type DepositMode = 'pix' | 'local' | null;

export interface BookAppointmentResponse extends Appointment {
  manageUrl: string;
  pix: PixPaymentInfo | null;
  depositCents: number;
  depositMode: DepositMode;
}

/** Detalhe do agendamento acessado pelo cliente via manageToken (sem login). */
export interface ManagedAppointment {
  id: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  manageToken: string;
  priceCentsSnapshot: number;
  durationMinutesSnapshot: number;
  client: { name: string; phone: string; email?: string | null };
  service: { id: string; name: string; durationMinutes: number; priceCents: number };
  professional: { id: string; name: string };
  tenant: {
    slug: string;
    name: string;
    timezone: string;
    address?: string | null;
    whatsapp?: string | null;
    cancelMinHours: number;
  };
  pixCharge: PixChargeDetail | null;
  review: { rating: number; comment?: string | null } | null;
  canCancel: boolean;
  canCancelUntil: string;
  canReview: boolean;
}

export interface WaitlistJoinResponse {
  ok: boolean;
  id: string;
  alreadyOnList: boolean;
}

export interface ReportsSummary {
  period: { from: string; to: string };
  totals: {
    appointments: number;
    completed: number;
    cancelled: number;
    noShow: number;
    /** Fração 0..1 (ex.: 0.083 = 8,3%). */
    noShowRate: number;
    revenueCents: number;
    avgTicketCents: number;
    newClients: number;
  };
  topServices: { serviceId: string; name: string; count: number; revenueCents: number }[];
  byProfessional: {
    professionalId: string;
    name: string;
    completed: number;
    revenueCents: number;
    commissionPercent: number;
    commissionCents: number;
  }[];
}

export interface ClientListItem {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  notes?: string | null;
  loyaltyPoints: number;
  createdAt: string;
  appointmentsCount: number;
  completedCount: number;
  totalSpentCents: number;
  lastVisit?: string | null;
  noShowCount: number;
}

export interface ClientListResponse {
  total: number;
  page: number;
  pageSize: number;
  items: ClientListItem[];
}

export interface ClientAppointment {
  id: string;
  startsAt: string;
  status: AppointmentStatus;
  priceCentsSnapshot?: number;
  service?: { name: string } | null;
  professional?: { name: string } | null;
}

export interface ClientDetail {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  notes?: string | null;
  loyaltyPoints: number;
  createdAt: string;
  appointments: ClientAppointment[];
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  commissionPercent: number;
  isActive: boolean;
  createdAt: string;
}

export interface WaitlistEntry {
  id: string;
  dateKey: string;
  clientName: string;
  clientPhone: string;
  clientEmail?: string | null;
  status: WaitlistEntryStatus;
  createdAt: string;
}

export interface Review {
  id: string;
  rating: number;
  comment?: string | null;
  clientName?: string | null;
  isPublished: boolean;
  createdAt: string;
  appointment?: {
    startsAt: string;
    service?: { name: string } | null;
    professional?: { name: string } | null;
  } | null;
}

export interface TenantSettings {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  plan: PlanCode;
  about?: string | null;
  address?: string | null;
  whatsapp?: string | null;
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  bufferMinutes: number;
  slotGridMinutes: number;
  cancelMinHours: number;
  loyaltyEnabled: boolean;
  loyaltyPointsPerReal: number;
}

export interface ApiErrorBody {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}
