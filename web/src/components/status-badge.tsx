import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  LogOutIcon,
  SparklesIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { MemberStatus } from '@/lib/types';

const STATUS = {
  verified: {
    label: 'Đã xác thực',
    variant: 'success',
    icon: CircleCheckIcon,
    title: 'Có vai trò xác thực hoặc vai trò cảnh giới',
  },
  'needs-role': {
    label: 'Thiếu vai trò',
    variant: 'warning',
    icon: CircleAlertIcon,
    title:
      'Đã điền form nhưng hiện không có vai trò. Bấm nút xác thực để được cấp lại.',
  },
  unverified: {
    label: 'Chưa xác thực',
    variant: 'danger',
    icon: CircleDashedIcon,
    title: 'Chưa điền form xác thực',
  },
  left: {
    label: 'Đã rời server',
    variant: 'muted',
    icon: LogOutIcon,
    title: 'Đã xác thực nhưng không còn trong server',
  },
} as const;

export function StatusBadge({ status }: { status: MemberStatus | 'left' }) {
  const { label, variant, icon: Icon, title } = STATUS[status];

  return (
    <Badge variant={variant} title={title}>
      <Icon />
      {label}
    </Badge>
  );
}

export function NewBadge({ isNew, hours }: { isNew: boolean; hours: number }) {
  return isNew ? (
    <Badge variant="info" title={`Vào server trong ${hours} giờ qua`}>
      <SparklesIcon />
      Mới
    </Badge>
  ) : (
    <Badge variant="muted">Cũ</Badge>
  );
}
