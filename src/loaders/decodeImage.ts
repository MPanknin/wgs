export interface RawImage {
  width: number;
  height: number;
  data: Uint8Array; // RGBA8, row-major, top-left origin
}

let gl: WebGL2RenderingContext | null = null;

// Decodes an image to its exact RGBA8 values. Reads back through WebGL rather
// than a 2D canvas: canvas 2D stores premultiplied alpha, which corrupts RGB
// wherever alpha < 255 (SOG puts opacity in the alpha of sh0).
export async function decodeImage(bytes: Uint8Array): Promise<RawImage> {
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]), {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
  const { width, height } = bitmap;

  gl ??= document.createElement('canvas').getContext('webgl2');
  if (!gl) throw new Error('WebGL2 is required to decode images');

  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
  bitmap.close();

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  const data = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(framebuffer);
  gl.deleteTexture(texture);

  return { width, height, data };
}
