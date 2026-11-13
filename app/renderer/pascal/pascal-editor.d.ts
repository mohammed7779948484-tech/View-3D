/**
 * Type stand-in for `@pascal-app/editor`, used only by `tsc` (tsconfig.web.json `paths`). The package ships its
 * TypeScript source, not declarations, and our stricter compiler settings would check all of it. The build uses
 * the real package. Only what our host uses is declared; keep it in step with the editor version in package.json.
 */
import type { ComponentType } from 'react';

/** `packages/editor/src/lib/scene.ts` in 1.1.4. */
export type SceneGraph = {
  nodes: Record<string, unknown>;
  rootNodeIds: string[];
  collections?: Record<string, unknown>;
  materials?: Record<string, unknown>;
  installedPlugins?: string[];
};

/** The part of `EditorProps` (`packages/editor/src/components/editor/index.tsx`, 1.1.4) that the host passes. */
export type EditorProps = {
  layoutVersion?: 'v1' | 'v2';
  projectId?: string | null;
  projectName?: string | null;
  onLoad?: () => Promise<SceneGraph | null>;
  onSave?: (scene: SceneGraph, options?: { keepalive?: boolean }) => Promise<void>;
};

export declare const Editor: ComponentType<EditorProps>;

/** `@pascal-app/editor/locales`. */
export declare function registerBundledLocales(): void;
