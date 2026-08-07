THANNOW HERO ASSET PACK - 10 ROTATING HEROES

UPLOAD:
Copy the contents of the /hero folder to:
apps/web/public/assets/hero/

IMPORTANT:
Each hero uses TWO perfectly aligned files:
  *-then.jpg = damaged old layer
  *-now.jpg  = restored layer

Use both images in one draggable before/after slider.
Do NOT place the two images side-by-side as separate cards.

Recommended behavior:
- On each fresh browser/page load, choose a random hero index.
- Auto rotate to the next hero every 7 seconds.
- Pause rotation while the user drags/touches the comparison slider.
- Resume after interaction.
- Start slider around 48-52%.
- Use object-fit: cover/contain consistently for BOTH layers.
- Keep Then and Now labels visible.
- Mobile: slider must support touch dragging.

Manifest:
hero-manifest.json

Captions:
CAPTIONS.csv

Preview folder:
For review only. Do not use preview files as the actual draggable layers.
