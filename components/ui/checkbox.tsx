'use client';

import * as React from 'react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Checkbox primitive — thin Radix wrapper styled for the Cortex dark
 * theme. Mirrors the API of the reference `@orbit/ui/checkbox`:
 *
 *   <Checkbox checked={...} onCheckedChange={...} aria-label="..." />
 *
 * Indeterminate state ("some rows selected") renders a minus glyph,
 * which is the convention bulk-action tables already use elsewhere.
 *
 * Sized at 16px to fit the 13px UI rhythm without stealing focus from
 * primary content. Accent token wires the checked state to the brand.
 */
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer inline-flex size-4 shrink-0 items-center justify-center rounded-[4px]',
        'border border-nativz-border bg-background text-background transition-colors',
        'hover:border-text-muted',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-text/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
        'data-[state=checked]:border-accent-text data-[state=checked]:bg-accent-text',
        'data-[state=indeterminate]:border-accent-text data-[state=indeterminate]:bg-accent-text',
        'disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current"
      >
        {props.checked === 'indeterminate' ? (
          <Minus className="size-3" strokeWidth={3} />
        ) : (
          <Check className="size-3" strokeWidth={3} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
