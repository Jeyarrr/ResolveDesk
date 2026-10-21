import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ZodError } from 'zod';
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function formatDate(value: string, full = false) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    ...(full
      ? { year: 'numeric' as const, hour: 'numeric' as const, minute: '2-digit' as const }
      : {}),
  }).format(new Date(value));
}
export function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
export function errorMessage(error: unknown) {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? 'Please check the entered information.';
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
