# v13.2.6 implementation notes

The swipe transition now uses simple `translate3d` motion with no rotation/scale overshoot on the large cover image. Incoming animation is scheduled with `requestAnimationFrame`, avoiding a forced synchronous `offsetWidth` layout read. Low-end mode uses 150 ms exit and 190 ms entrance timing and no longer has its swipe feedback disabled. The global artwork `will-change` hint is removed and added only while a swipe animation class is active.

Album ambience was increased in clarity while lowering blur costs (76px desktop and 54px mobile). Low-end mode disables the expensive blur and drift animation but keeps a stronger static gradient overlay. This is intended to reduce paint/compositing cost on weaker GPUs without making the player background disappear.
