/** The preload bridge as the renderer sees it. The renderer never touches the disk itself. */
import type { ProjectBridge } from '../../shared/project-api';

declare global {
  interface Window {
    view3d: ProjectBridge;
  }
}

export const bridge = (): ProjectBridge => window.view3d;
