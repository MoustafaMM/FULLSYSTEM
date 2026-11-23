import React, { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';

interface LocalImagePreviewProps {
  file: File;
  alt: string;
  className?: string;
}

/**
 * Safely renders a local File preview without leaking Object URLs across re-renders.
 * Automatically falls back to FileReader data: URL if blob: URLs fail on mobile WebViews,
 * and renders a clean fallback indicator instead of a broken image icon if unreadable.
 */
export const LocalImagePreview: React.FC<LocalImagePreviewProps> = ({ file, alt, className }) => {
  const [src, setSrc] = useState<string>('');
  const [usedDataUrlFallback, setUsedDataUrlFallback] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setUsedDataUrlFallback(false);
    setHasError(false);

    if (!file || file.size === 0) {
      setSrc('');
      setHasError(true);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setSrc(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  const handleError = () => {
    if (!usedDataUrlFallback && file && file.size > 0) {
      setUsedDataUrlFallback(true);
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string' && reader.result.length > 0) {
          setSrc(reader.result);
        } else {
          setHasError(true);
        }
      };
      reader.onerror = () => {
        setHasError(true);
      };
      reader.readAsDataURL(file);
      return;
    }
    setHasError(true);
  };

  if (hasError || !src) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1.5 bg-slate-900 text-slate-300 px-4 text-center ${className || ''}`}
      >
        <ImageOff size={22} className="text-amber-400" />
        <span className="text-xs font-medium">Preview unavailable — tap Camera or Gallery to retake</span>
      </div>
    );
  }

  return <img src={src} alt={alt} className={className} onError={handleError} />;
};
