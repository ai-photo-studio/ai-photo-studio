import { useEffect, useRef, useState } from "react";
import { HERO_HEROES, type HeroHero } from "../data/heroes";

/**
 * R9.3-P7 HD rotating hero comparison slider.
 *
 * One comparison frame holds two aligned layers of a single before/after photo:
 *   - base layer  = Then/original (damaged) image
 *   - overlay layer = Now/restored image
 * A customer-draggable divider reveals the restored layer. The frame is square
 * (matching the 1600x1600 HD source) and both layers use object-fit: cover with
 * identical sizing so the two layers are perfectly aligned at every crop.
 *
 * Behavior:
 *   - a fresh mount starts on a random hero
 *   - automatic rotation to the next hero (~7s) resets the divider to 50%
 *   - rotation pauses during pointer/touch drag and resumes afterward
 *   - timer is cleaned up on unmount to avoid leaks
 */
export function HeroCompareSlider() {
  const [activeIndex, setActiveIndex] = useState(
    () => Math.floor(Math.random() * HERO_HEROES.length)
  );
  const [position, setPosition] = useState(50);
  const [dragging, setDragging] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);

  const active: HeroHero = HERO_HEROES[activeIndex];
  const next: HeroHero = HERO_HEROES[(activeIndex + 1) % HERO_HEROES.length];

  // Rotation timer. Paused while dragging; resets divider to 50% on change.
  useEffect(() => {
    if (dragging) return;
    const ms = active.rotationSeconds * 1000;
    const id = window.setTimeout(() => {
      setActiveIndex((prev) => (prev + 1) % HERO_HEROES.length);
      setPosition(50);
    }, ms);
    return () => window.clearTimeout(id);
  }, [active.rotationSeconds, activeIndex, dragging]);

  // Preload only the up-next pair so rotation lands instantly without loading
  // the whole set up front.
  useEffect(() => {
    const thenImg = new Image();
    const nowImg = new Image();
    thenImg.src = next.then;
    nowImg.src = next.now;
  }, [next.then, next.now]);

  const updateFromClientX = (clientX: number) => {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    setPosition(Math.min(100, Math.max(0, ratio * 100)));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    updateFromClientX(event.clientX);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    updateFromClientX(event.clientX);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
  };

  return (
    <div className="hero-compare-wrap">
      <div
        ref={frameRef}
        className={`hero-compare-frame${dragging ? " is-dragging" : ""}`}
        role="img"
        aria-label={active.alt}
        data-active-hero-id={active.id}
        data-hero-then={active.then}
        data-hero-now={active.now}
        data-position={Math.round(position)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <img
          className="hero-layer hero-layer-then"
          src={active.then}
          alt=""
          loading="eager"
          draggable={false}
        />
        <span className="hero-layer hero-layer-now" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
          <img
            className="hero-layer-img"
            src={active.now}
            alt=""
            loading="eager"
            draggable={false}
          />
        </span>
        <span className="hero-divider" style={{ left: `${position}%` }} aria-hidden="true">
          <span className="hero-handle" />
        </span>
      </div>
      <p className="hero-caption">{active.caption}</p>
    </div>
  );
}
