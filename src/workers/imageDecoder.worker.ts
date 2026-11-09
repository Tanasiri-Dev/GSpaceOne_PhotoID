/// <reference lib="webworker" />

export interface DecodeRequest {
  id: string;
  base64: string;
}

export interface DecodeResponse {
  id: string;
  success: boolean;
  imageBitmap?: ImageBitmap;
  width?: number;
  height?: number;
  error?: string;
}

self.onmessage = async (e: MessageEvent<DecodeRequest>) => {
  const { id, base64 } = e.data;

  try {
    if (!base64) {
      throw new Error('Base64 string is empty');
    }

    // Strip data URL scheme prefix if present
    const commaIndex = base64.indexOf(',');
    const cleanBase64 = commaIndex !== -1 ? base64.slice(commaIndex + 1) : base64;

    // Decode base64 to binary buffer
    const binaryString = atob(cleanBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Create Blob and ImageBitmap off the main thread
    const blob = new Blob([bytes], { type: 'image/png' });
    const imageBitmap = await createImageBitmap(blob);

    const response: DecodeResponse = {
      id,
      success: true,
      imageBitmap,
      width: imageBitmap.width,
      height: imageBitmap.height,
    };

    // Transfer ImageBitmap ownership back to the main thread to avoid copying
    self.postMessage(response, [imageBitmap]);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const response: DecodeResponse = {
      id,
      success: false,
      error: errorMsg,
    };
    self.postMessage(response);
  }
};
