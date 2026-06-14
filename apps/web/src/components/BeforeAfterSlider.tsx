import { useState, useRef } from "react";
import type { MouseEvent, TouchEvent } from "react";

interface BeforeAfterSliderProps {
  beforeSrc: string;
  afterSrc: string;
  beforeAlt?: string;
  afterAlt?: string;
}

export function BeforeAfterSlider({ beforeSrc, afterSrc, beforeAlt = "Before", afterAlt = "After" }: BeforeAfterSliderProps) {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const sliderRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const percent = ((e.clientX - rect.left) / rect.width) * 100;
    setSliderPosition(Math.max(0, Math.min(100, percent)));
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (!isDragging || !sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const percent = ((e.touches[0].clientX - rect.left) / rect.width) * 100;
    setSliderPosition(Math.max(0, Math.min(100, percent)));
  };

  return (
    <div
      ref={sliderRef}
      className="before-after-slider"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleMouseLeave}
    >
      <div className="before-after-container">
        <div className="before-panel">
          <img src={beforeSrc} alt={beforeAlt} loading="lazy" />
          <span className="before-after-label">{beforeAlt}</span>
        </div>
        <div className="after-panel">
          <img src={afterSrc} alt={afterAlt} loading="lazy" />
          <span className="before-after-label">{afterAlt}</span>
        </div>
      </div>
      <div
        className={`slider-handle ${isDragging ? "slider-handle-dragging" : ""}`}
        style={{ left: `${sliderPosition}%` }}
        onMouseDown={() => setIsDragging(true)}
        onTouchStart={() => setIsDragging(true)}
      >
        <div className="slider-line"></div>
        <div className="slider-thumb"></div>
        <div className="slider-line"></div>
      </div>
    </div>
  );
}