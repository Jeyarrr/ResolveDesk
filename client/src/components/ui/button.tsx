import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

// Adapted from shadcn/ui's New York Button (MIT):
// https://ui.shadcn.com/r/styles/new-york/button.json
// Locally owned Radix Slot/CVA composition with ResolveDesk theme variants.
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm',
        outline: 'border border-border bg-card hover:bg-accent text-foreground',
        ghost: 'hover:bg-accent text-muted-foreground hover:text-foreground',
        destructive: 'bg-destructive text-white hover:bg-destructive/90',
      },
      size: { default: 'h-10 px-4 py-2', sm: 'h-8 px-3 text-xs', icon: 'size-10' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);
export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
