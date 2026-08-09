/** Tipos alinhados ao contrato da API Agenda Pro. */

export type PlanCode = 'STARTER' | 'PRO' | 'BUSINESS';

export type AppointmentStatus =
  'PENDING_PAYMENT' | 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

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

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse extends AuthTokens {
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

export interface ClientSummary {
  id?: string;
  name: string;
  phone: string;
  email?: string | null;
}

export interface Appointment {
  id: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  customerNotes?: string | null;
  service?: Service | null;
  client?: ClientSummary | null;
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

export interface PublicTenantProfile {
  name: string;
  slug: string;
  timezone?: string;
  services: Service[];
}

export interface BookAppointmentPayload {
  serviceId: string;
  startsAt: string;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  notes?: string;
}

export interface ApiErrorBody {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}
