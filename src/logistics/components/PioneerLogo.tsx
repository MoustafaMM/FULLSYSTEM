import React from 'react';
import pioneerLogo from '../assets/pioneer-logo.png';
import pioneerMark from '../assets/pioneer-mark.png';

export interface PioneerLogoProps {
  className?: string;
  variant?: 'full' | 'mark';
  alt?: string;
}

export default function PioneerLogo({
  className = "",
  variant = 'full',
  alt = "Pioneer Education Services"
}: PioneerLogoProps) {
  const src = variant === 'mark' ? pioneerMark : pioneerLogo;

  return (
    <img
      src={src}
      alt={alt}
      className={`object-contain select-none pointer-events-none shrink-0 ${className}`}
      loading="eager"
      decoding="async"
    />
  );
}
