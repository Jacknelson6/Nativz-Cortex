'use client';

import * as React from 'react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

/**
 * Tooltip primitive — thin Radix wrapper styled for the Cortex dark
 * theme. The four building blocks (`TooltipProvider`, `Tooltip`,
 * `TooltipTrigger`, `TooltipContent`) mirror Radix exactly so call
 * sites read like the docs.
 *
 *   <TooltipProvider delayDuration={200}>
 *     <Tooltip>
 *       <TooltipTrigger asChild>
 *         <button>Hover me</button>
 *       </TooltipTrigger>
 *       <TooltipContent>Helpful copy</TooltipContent>
 *     </Tooltip>
 *   </TooltipProvider>
 *
 * Used by the review table's stage pill to surface the pipeline
 * stage explanation on hover without crowding the row.
 */
function TooltipProvider({
  delayDuration = 150,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />;
}

const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          'z-50 max-w-xs rounded-md border border-nativz-border bg-surface px-2.5 py-1.5',
          'text-xs leading-snug text-text-primary shadow-lg',
          'data-[state=delayed-open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0',
          'data-[state=delayed-open]:zoom-in-95',
          className,
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="fill-nativz-border" width={10} height={5} />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
