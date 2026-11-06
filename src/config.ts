export type RenderBackend = 'webgl' | 'webgpu';

export interface Config {
  backend: RenderBackend;
  model: string; // .ply, .sog or SOG meta.json
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
  model: new URLSearchParams(window.location.search).get('model') ?? '/models/banana.compressed.ply',
};
