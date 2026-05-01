'use client';

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@/lib/utils/cn';

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverAnchor = PopoverPrimitive.Anchor;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
    /** Match anchor width (default true for command bars). */
    matchAnchorWidth?: boolean;
    /**
     * Skip the Radix portal and render inline inside the trigger's DOM
     * subtree. Required when the popover lives inside a native
     * `<dialog>.showModal()` modal, otherwise the portaled content lands
     * in `document.body` (below the dialog's top-layer) and becomes
     * invisible. Default false to preserve existing behaviour.
     */
    disablePortal?: boolean;
  }
>(
  (
    {
      className,
      align = 'start',
      sideOffset = 8,
      matchAnchorWidth = true,
      disablePortal = false,
      children,
      ...props
    },
    ref,
  ) => {
    const content = (
      <PopoverPrimitive.Content
        ref={ref}
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(
          'z-[100] origin-[var(--radix-popover-content-transform-origin)] rounded-xl border border-nativz-border bg-surface p-0 text-text-primary shadow-[var(--shadow-dropdown)] outline-none',
          'data-[state=open]:animate-[cortex-popover-in_0.22s_var(--ease-out-expo)_both]',
          matchAnchorWidth &&
            'w-[var(--radix-popover-trigger-width)] max-w-[min(100vw-2rem,var(--radix-popover-trigger-width))]',
          className,
        )}
        {...props}
      >
        {children}
      </PopoverPrimitive.Content>
    );
    if (disablePortal) return content;
    return <PopoverPrimitive.Portal>{content}</PopoverPrimitive.Portal>;
  },
);
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverAnchor, PopoverContent };
