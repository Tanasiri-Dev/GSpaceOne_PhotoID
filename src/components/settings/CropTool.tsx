import React, { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../../state/store';

type AspectPreset = 'free' | '1:1' | '3:4' | '2:3' | 'custom';

export const CropTool: React.FC = () => {
  const cropActive = useAppStore((state) => state.cropActive);
  const cropX = useAppStore((state) => state.cropX);
  const cropY = useAppStore((state) => state.cropY);
  const cropWidth = useAppStore((state) => state.cropWidth);
  const cropHeight = useAppStore((state) => state.cropHeight);
  const imageDimensions = useAppStore((state) => state.imageDimensions);
  const setCrop = useAppStore((state) => state.setCrop);
  const setCropActive = useAppStore((state) => state.setCropActive);

  const [preset, setPreset] = useState<AspectPreset>('free');
  const [lockAspect, setLockAspect] = useState<boolean>(false);
  const [aspectRatioValue, setAspectRatioValue] = useState<number>(1);

  // Local width & height inputs for user typing
  const [inputWidth, setInputWidth] = useState<number>(cropWidth || 1000);
  const [inputHeight, setInputHeight] = useState<number>(cropHeight || 1000);

  // Sync inputs with store
  useEffect(() => {
    if (cropWidth > 0) setInputWidth(Math.round(cropWidth));
    if (cropHeight > 0) setInputHeight(Math.round(cropHeight));
  }, [cropWidth, cropHeight]);

  // Handle Preset Selection
  const handleSelectPreset = useCallback(
    (selectedPreset: AspectPreset) => {
      setPreset(selectedPreset);
      const imgW = imageDimensions?.width || 1200;
      const imgH = imageDimensions?.height || 1600;

      if (selectedPreset === 'free' || selectedPreset === 'custom') {
        setLockAspect(false);
        return;
      }

      setLockAspect(true);
      let ratio = 1;
      if (selectedPreset === '1:1') ratio = 1.0;
      if (selectedPreset === '3:4') ratio = 3 / 4;
      if (selectedPreset === '2:3') ratio = 2 / 3;

      setAspectRatioValue(ratio);

      // Compute centered crop box matching the ratio
      let targetW = imgW * 0.8;
      let targetH = targetW / ratio;

      if (targetH > imgH * 0.8) {
        targetH = imgH * 0.8;
        targetW = targetH * ratio;
      }

      const newX = (imgW - targetW) / 2;
      const newY = (imgH - targetH) / 2;

      setInputWidth(Math.round(targetW));
      setInputHeight(Math.round(targetH));
      setCrop(newX, newY, targetW, targetH);
    },
    [imageDimensions, setCrop]
  );

  // Handle Width change
  const handleWidthChange = (val: number) => {
    const imgW = imageDimensions?.width || 4000;
    const clampedW = Math.max(10, Math.min(imgW, val));
    setInputWidth(clampedW);

    if (lockAspect && aspectRatioValue > 0) {
      const newH = Math.round(clampedW / aspectRatioValue);
      setInputHeight(newH);
      setCrop(cropX, cropY, clampedW, newH);
    } else {
      setCrop(cropX, cropY, clampedW, inputHeight);
    }
  };

  // Handle Height change
  const handleHeightChange = (val: number) => {
    const imgH = imageDimensions?.height || 4000;
    const clampedH = Math.max(10, Math.min(imgH, val));
    setInputHeight(clampedH);

    if (lockAspect && aspectRatioValue > 0) {
      const newW = Math.round(clampedH * aspectRatioValue);
      setInputWidth(newW);
      setCrop(cropX, cropY, newW, clampedH);
    } else {
      setCrop(cropX, cropY, inputWidth, clampedH);
    }
  };

  const handleToggleLock = () => {
    const newLock = !lockAspect;
    setLockAspect(newLock);
    if (newLock && inputHeight > 0) {
      setAspectRatioValue(inputWidth / inputHeight);
    }
  };

  const handleApplyCrop = () => {
    setCropActive(true);
    setCrop(cropX, cropY, inputWidth, inputHeight);
  };

  const handleClearCrop = () => {
    setCropActive(false);
    if (imageDimensions) {
      setCrop(0, 0, imageDimensions.width, imageDimensions.height);
      setInputWidth(imageDimensions.width);
      setInputHeight(imageDimensions.height);
    }
    setPreset('free');
    setLockAspect(false);
  };

  return (
    <div className="crop-controls">
      {/* Preset Buttons */}
      <div className="form-group">
        <label className="form-label">Aspect Ratio Preset</label>
        <div className="preset-pills">
          {(['free', '1:1', '3:4', '2:3', 'custom'] as AspectPreset[]).map((p) => (
            <button
              key={p}
              type="button"
              className={`preset-pill ${preset === p ? 'active' : ''}`}
              onClick={() => handleSelectPreset(p)}
            >
              {p === 'free' ? 'Free' : p === 'custom' ? 'Custom' : p}
            </button>
          ))}
        </div>
      </div>

      {/* Dimensions Input Row */}
      <div className="input-row">
        <div className="form-group">
          <label className="form-label">Width (px)</label>
          <input
            type="number"
            className="text-input"
            value={inputWidth}
            min={10}
            step={1}
            onChange={(e) => handleWidthChange(parseInt(e.target.value, 10) || 10)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Height (px)</label>
          <input
            type="number"
            className="text-input"
            value={inputHeight}
            min={10}
            step={1}
            onChange={(e) => handleHeightChange(parseInt(e.target.value, 10) || 10)}
          />
        </div>
      </div>

      {/* Lock Aspect Ratio Toggle */}
      <div className="toggle-row" onClick={handleToggleLock} role="button" tabIndex={0}>
        <span className="form-label" style={{ cursor: 'pointer', margin: 0 }}>
          Lock Aspect Ratio {lockAspect ? `(${aspectRatioValue.toFixed(2)})` : ''}
        </span>
        <div className={`toggle-switch ${lockAspect ? 'active' : ''}`}>
          <div className="toggle-knob" />
        </div>
      </div>

      {/* Crop Action Buttons */}
      <div className="input-row">
        <button
          type="button"
          className={`btn ${cropActive ? 'btn-primary' : 'btn-secondary'} w-full`}
          onClick={handleApplyCrop}
        >
          {cropActive ? 'Crop Active' : 'Enable Crop'}
        </button>
        {cropActive && (
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={handleClearCrop}
            title="Reset crop to full image"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
};
