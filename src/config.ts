export type RenderBackend = 'webgl' | 'webgpu';

export interface Config {
  backend: RenderBackend;
}

function getBackendFromURL(): RenderBackend {
  const params = new URLSearchParams(window.location.search);

  if (params.has('webgl')) {
    return 'webgl';
  }

  if (params.has('webgpu')) {
    return 'webgpu';
  }

  if ('gpu' in navigator) {
    return 'webgpu';
  }

  return 'webgl';
}

export const config: Config = {
  backend: getBackendFromURL(),
};
