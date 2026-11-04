import * as React from 'react';
import { cn } from '@/lib/utils';

/** shadcn/ui Avatar look: the image, or initials when it is missing/fails. */
function Avatar({
  src,
  name,
  className,
}: {
  src: string | null;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = React.useState(false);
  const initials = name.trim().slice(0, 1).toUpperCase() || '?';

  return (
    <span
      data-slot="avatar"
      className={cn(
        'relative flex size-8 shrink-0 overflow-hidden rounded-full',
        className,
      )}
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          className="aspect-square size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="flex size-full items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
          {initials}
        </span>
      )}
    </span>
  );
}

export { Avatar };
