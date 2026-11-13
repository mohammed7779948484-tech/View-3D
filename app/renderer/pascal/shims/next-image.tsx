/**
 * Stands in for `next/image` (decisions/0008: Next.js is not used). Pascal's editor imports it in 26 files;
 * a plain <img> is enough in a local app: no image server, so the optimisation props are dropped.
 */
import type { CSSProperties, ImgHTMLAttributes } from 'react';

type StaticSrc = { src: string; width?: number; height?: number };

export type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string | StaticSrc;
  fill?: boolean;
  unoptimized?: boolean;
  priority?: boolean;
  quality?: number;
  placeholder?: string;
  blurDataURL?: string;
  sizes?: string;
  loader?: unknown;
};

export default function Image({ src, fill, unoptimized, priority, quality, placeholder, blurDataURL, sizes, loader, style, ...rest }: ImageProps) {
  void [unoptimized, priority, quality, placeholder, blurDataURL, sizes, loader];
  const url = typeof src === 'string' ? src : src.src;
  const fillStyle: CSSProperties | undefined = fill ? { position: 'absolute', inset: 0, width: '100%', height: '100%' } : undefined;
  return <img src={url} style={{ ...fillStyle, ...style }} {...rest} />;
}
