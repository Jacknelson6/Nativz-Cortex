import Image from 'next/image';
import { cn } from '@/lib/utils';

const SRC = '/integrations/uppromote.png';

export function UpPromoteLogo({
  size = 36,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src={SRC}
      alt="UpPromote"
      width={size}
      height={size}
      className={cn('rounded-lg object-cover shrink-0', className)}
    />
  );
}
