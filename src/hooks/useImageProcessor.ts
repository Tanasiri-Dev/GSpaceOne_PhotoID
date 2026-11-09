import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { DecodeRequest, DecodeResponse } from '../workers/imageDecoder.worker';

export interface ProcessImageOptions {
  path: string | null;
  brightness: number; // -100 to 100
  exposure: number; // -3.0 to 3.0
  gamma: number; // 0.1 to 5.0
  crop?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
}

export interface ProcessImageResult {
  previewBase64: string;
  imageBitmap?: ImageBitmap;
}

export function useImageProcessor() {
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentRequestIdRef = useRef<number>(0);
  const pendingDecodesRef = useRef<
    Map<string, { resolve: (val: ImageBitmap) => void; reject: (err: Error) => void }>
  >(new Map());

  // Initialize Web Worker for background image decoding
  useEffect(() => {
    let worker: Worker | null = null;
    try {
      worker = new Worker(
        new URL('../workers/imageDecoder.worker.ts', import.meta.url),
        { type: 'module' }
      );

      worker.onmessage = (e: MessageEvent<DecodeResponse>) => {
        const { id, success, imageBitmap, error: workerError } = e.data;
        const pending = pendingDecodesRef.current.get(id);
        if (pending) {
          pendingDecodesRef.current.delete(id);
          if (success && imageBitmap) {
            pending.resolve(imageBitmap);
          } else {
            pending.reject(new Error(workerError || 'Worker decoding failed'));
          }
        }
      };

      worker.onerror = (err) => {
        console.error('Image decoder worker error:', err);
      };

      workerRef.current = worker;
    } catch (err) {
      console.warn('Could not initialize Web Worker for decoding:', err);
    }

    return () => {
      if (worker) {
        worker.terminate();
      }
    };
  }, []);

  /**
   * Offload base64 to ImageBitmap decoding to Web Worker
   */
  const decodeWithWorker = useCallback((base64: string): Promise<ImageBitmap> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        // Fallback: decode directly via HTML Image if worker unavailable
        const img = new Image();
        img.onload = () => {
          createImageBitmap(img).then(resolve).catch(reject);
        };
        img.onerror = () => reject(new Error('Failed to load image in main thread'));
        img.src = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
        return;
      }

      const id = `decode_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      pendingDecodesRef.current.set(id, { resolve, reject });

      const request: DecodeRequest = { id, base64 };
      workerRef.current.postMessage(request);
    });
  }, []);

  /**
   * Process image adjustments with 50ms debouncing
   */
  const processImage = useCallback(
    (options: ProcessImageOptions): Promise<ProcessImageResult | null> => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      currentRequestIdRef.current += 1;
      const requestId = currentRequestIdRef.current;

      return new Promise((resolve) => {
        debounceTimerRef.current = setTimeout(async () => {
          // If a newer request has started, cancel this one
          if (requestId !== currentRequestIdRef.current) {
            resolve(null);
            return;
          }

          setIsProcessing(true);
          setError(null);

          try {
            const normalizedBrightness = options.brightness / 100.0;

            const previewBase64 = await invoke<string>('apply_adjustments', {
              brightness: normalizedBrightness,
              exposure: options.exposure,
              gamma: options.gamma,
            });

            if (!previewBase64) {
              setIsProcessing(false);
              resolve(null);
              return;
            }

            // Decode in Web Worker to avoid blocking UI thread
            let bitmap: ImageBitmap | undefined;
            try {
              bitmap = await decodeWithWorker(previewBase64);
            } catch (decodeErr) {
              console.warn('Worker decode failed, falling back:', decodeErr);
            }

            setIsProcessing(false);
            resolve({ previewBase64, imageBitmap: bitmap });
          } catch (invokeErr: unknown) {
            const msg = invokeErr instanceof Error ? invokeErr.message : String(invokeErr);
            console.warn('apply_adjustments backend invoke failed:', msg);
            setError(msg);
            setIsProcessing(false);
            resolve(null);
          }
        }, 50); // 50ms debounce
      });
    },
    [decodeWithWorker]
  );

  return {
    processImage,
    isProcessing,
    error,
    decodeWithWorker,
  };
}
