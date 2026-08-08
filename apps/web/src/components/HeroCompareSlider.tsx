import { useEffect, useRef, useState } from "react";
import { HERO_HEROES, type HeroHero } from "../data/heroes";

/**
 * Premium Hero V2 rotating comparison slider.
 *
 * Exactly ONE comparison frame renders the full photograph with two aligned
 * layers of a single before/after pair:
 *   - base layer  = Then/original (damaged) image (full sharp copy)
 *   - overlay layer = Now/restored image (full sharp copy, clipped to the
 *                     divider position so it reveals the matching side)
 * A customer-draggable divider sits at the middle: at 50% the LEFT half shows
 * Then and the RIGHT half shows Now.
 *
 * Rendering rules (Premium Hero V2):
 *   - Exactly one sharp Then layer and one sharp Now layer (no duplicate
 *     foreground copies, no blurred/ghost background layer).
 *   - The divider handle renders horizontal LEFT/RIGHT arrows (not a vertical
 *     triangle) to signal the drag direction.
 *   - Small "Then"/"Now" labels are UI/CSS pills at the LEFT/RIGHT edges at
 *     the midline; they are never baked into the image assets.
 *
 * Behavior:
 *   - a fresh mount starts on a random hero
 *   - automatic rotation to the next hero (~7s per manifest) resets the
 *     divider to 50%
 *   - rotation pauses during pointer/touch drag and resumes afterward
 *   - timer is cleaned up on unmount to avoid leaks
 */
const LABELS = {
  then: "Then",
  now: "Now"
};

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

  const clip = `inset(0 ${100 - position}% 0 0)`;

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
        <span className="hero-layer hero-layer-now" style={{ clipPath: clip }} aria-hidden="true">
          <img
            className="hero-layer-img"
            src={active.now}
            alt=""
            loading="eager"
            draggable={false}
          />
        </span>
        <span className="hero-label hero-label-then" aria-hidden="true">{LABELS.then}</span>
        <span className="hero-label hero-label-now" aria-hidden="true">{LABELS.now}</span>
        <span className="hero-divider" style={{ left: `${position}%` }} aria-hidden="true">
          <span className="hero-handle" />
        </span>
      </div>
      <p className="hero-caption">{active.caption}</p>
    </div>
  );
}
