import { useEffect, useState } from 'react';
import { Film } from 'lucide-react';
import heroSenjaJakarta from '../assets/images/hero_senja_jakarta_1794936964523.jpg';
import posterDetikTerakhir from '../assets/images/poster_detik_terakhir_1794936967148.jpg';
import posterKodeMalam from '../assets/images/poster_kode_malam_1794936965812.jpg';
import posterKontrakCinta from '../assets/images/poster_kontrak_cinta_1794936966082.jpg';
import posterRahasiaPewaris from '../assets/images/poster_rahasia_pewaris_1794936964799.jpg';
import posterWarisanRasa from '../assets/images/poster_warisan_rasa_1794936966430.jpg';

const BUNDLED_IMAGE_MAP: Record<string, string> = {
  '/src/assets/images/hero_senja_jakarta_1794936964523.jpg': heroSenjaJakarta,
  '/src/assets/images/poster_rahasia_pewaris_1794936964799.jpg':
    posterRahasiaPewaris,
  '/src/assets/images/poster_kontrak_cinta_1794936966082.jpg':
    posterKontrakCinta,
  '/src/assets/images/poster_kode_malam_1794936965812.jpg': posterKodeMalam,
  '/src/assets/images/poster_warisan_rasa_1794936966430.jpg': posterWarisanRasa,
  '/src/assets/images/poster_detik_terakhir_1794936967148.jpg':
    posterDetikTerakhir,
};

export function resolvePosterAssetUrl(src: string): string {
  const trimmed = src.trim();
  return BUNDLED_IMAGE_MAP[trimmed] ?? trimmed;
}

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
  const resolvedSrc = resolvePosterAssetUrl(src);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [resolvedSrc]);

  if (hasError || !resolvedSrc) {
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
      src={resolvedSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={className}
    />
  );
}
