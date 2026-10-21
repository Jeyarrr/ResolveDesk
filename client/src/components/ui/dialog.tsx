import * as Primitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Primitive.Root open={open} onOpenChange={onOpenChange}>
      <Primitive.Portal>
        <Primitive.Overlay className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm" />
        <Primitive.Content
          className={cn(
            'dialog-content fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-2xl',
            className,
          )}
        >
          <Primitive.Title className="pr-8 text-lg font-semibold">{title}</Primitive.Title>
          <Primitive.Description className="mt-2 text-sm text-muted-foreground">
            {description}
          </Primitive.Description>
          <Primitive.Close
            className="absolute right-4 top-4 rounded p-1 text-muted-foreground hover:bg-accent"
            aria-label="Close dialog"
          >
            <X size={18} />
          </Primitive.Close>
          <div className="mt-5">{children}</div>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
