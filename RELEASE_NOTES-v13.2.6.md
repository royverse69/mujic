# Mujic v13.2.6

## Smoother artwork swipes and clearer ambience

- Reworked track-swipe motion to animate only translation and a small opacity change; removed rotation and scale overshoot from the large artwork image.
- Removed the forced synchronous layout read (`offsetWidth`) from the incoming artwork transition. The new animation begins on the next animation frame.
- Shortened the swipe lock so the player responds sooner. Constrained/low-end mode uses a short, straight transform slide rather than abruptly disabling swipe feedback. Reduced-motion preferences still disable these animations.
- Made album-colour ambience more visible with a moderately brighter, less heavily dimmed gradient. High-end devices use reduced blur radius; low-end mode skips blur and motion while preserving a clearer colour wash.
- Bumped the app and service-worker cache version to 13.2.6 so deployed clients fetch the updated CSS and JavaScript.

## Validation

`npm run check` runs the existing project regression suite plus new v13.2.6 checks for short low-end animation timing, removal of forced layout, and gradient treatment.
