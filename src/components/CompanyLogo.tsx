import React from 'react';
import { looksLikeImage } from '../imageUtils';

type Props = {
  logo?: string | null;
  companyName?: string | null;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
  alt?: string;
};

function initials(name?: string | null): string {
  const parts = String(name || 'Hailite Manager').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map(part => part[0]?.toUpperCase() || '').join('') || 'HM';
}

export default function CompanyLogo({
  logo,
  companyName,
  className = 'w-10 h-10',
  imageClassName = 'w-full h-full object-contain',
  fallbackClassName = 'bg-orange-600 text-white',
  alt
}: Props) {
  if (looksLikeImage(logo)) {
    return (
      <span className={`inline-flex items-center justify-center overflow-hidden ${className}`}>
        <img
          src={String(logo)}
          alt={alt || `${companyName || 'Company'} logo`}
          className={imageClassName}
          referrerPolicy="no-referrer"
        />
      </span>
    );
  }

  const textualLogo = String(logo || '').trim();
  return (
    <span className={`inline-flex items-center justify-center font-black ${fallbackClassName} ${className}`} aria-label={alt || `${companyName || 'Company'} logo`}>
      {textualLogo && textualLogo.length <= 4 ? textualLogo : initials(companyName)}
    </span>
  );
}
