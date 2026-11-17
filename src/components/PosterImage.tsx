import { useState } from 'react';
import { Film } from 'lucide-react';

interface PosterImageProps {
  src: string;
  alt: string;
  title: string;
  className?: string;
}

export function PosterImage({
  src,
  alt,
  title,
  className = '',
}: PosterImageProps) {
  const [hasError, setHasError] = useState(false);

  if (hasError || !src) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#18181B] via-[#111114] to-[#09090B] p-4 text-center ${className}`}
        role="img"
        aria-label={alt}
      >
        <Film className="mb-2 h-8 w-8 text-zinc-500" aria-hidden="true" />
        <span className="font-display text-sm font-semibold text-zinc-300 line-clamp-2">
          {title}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={className}
    />
  );
}
