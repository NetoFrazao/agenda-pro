/**
 * Barrel do design system Graphite — importe daqui nos Agentes 2–3.
 *
 * @example
 * import { Button, ToastProvider, useToast, SkeletonList, icons } from '@/components';
 * import { Check, X } from '@/components/icons';
 */
export { AppProviders } from './AppProviders';
export { AuthProvider, useAuth } from './AuthProvider';
export { AuthShell } from './AuthShell';
export { BrandLogo } from './BrandLogo';
export { DashboardShell, AuthGuard } from './DashboardShell';
export { OnboardingWizard } from './OnboardingWizard';
export { CopyButton, PixBlock } from './pix';
export { SiteFooter, SiteHeader } from './SiteChrome';
export { SlotListbox } from './SlotListbox';
export { DateChipListbox, type DateChip } from './DateChipListbox';
export {
  Toast,
  ToastProvider,
  useToast,
  type ToastItem,
  type ToastTone,
} from './Toast';
export * as icons from './icons';
export { iconSize } from './icons';
export {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  PageSkeleton,
  PageTitle,
  Select,
  Skeleton,
  SkeletonCard,
  SkeletonList,
  Spinner,
  Stars,
  StatCard,
  StatusBadge,
  Textarea,
} from './ui';
