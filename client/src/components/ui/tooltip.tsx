import * as Primitive from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Primitive.Root>
      <Primitive.Trigger asChild>{children}</Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Content
          side="right"
          sideOffset={10}
          className="z-50 rounded-md border border-border bg-popover px-3 py-2 text-xs text-foreground shadow-lg"
        >
          {label}
          <Primitive.Arrow className="fill-popover" />
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
