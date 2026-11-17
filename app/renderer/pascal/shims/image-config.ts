/** Stands in for `next/dist/shared/lib/image-config` (used by Pascal's node-icon-image.tsx). */
export type ImageConfigComplete = {
  domains?: string[] | undefined;
  remotePatterns?: unknown[] | undefined;
  [key: string]: unknown;
};

export const imageConfigDefault: ImageConfigComplete = { domains: undefined, remotePatterns: undefined };
