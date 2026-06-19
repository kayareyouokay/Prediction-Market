import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import './Badge.css';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'info' | 'yes' | 'no';
  size?: 'sm' | 'md';
  children: ReactNode;
}

function Badge({
  variant = 'default',
  size = 'md',
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn('badge', `badge--${variant}`, `badge--${size}`, className)}
      {...props}
    >
      {children}
    </span>
  );
}

export { Badge };
export type { BadgeProps };
