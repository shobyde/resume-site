/* Shared live motion preference.
   `reduced` is a getter so callers always see the CURRENT system
   setting, not a value frozen at module-load. The matchMedia
   listener dispatches `motionprefchange` on window so subsystems
   (background WebGL, stream text) can reconfigure without a reload. */
const mq = window.matchMedia('(prefers-reduced-motion: reduce)');

export const motionPrefs = {
  get reduced() { return mq.matches; },
  mq,
};

function notify() {
  window.dispatchEvent(new CustomEvent('motionprefchange'));
}
if (typeof mq.addEventListener === 'function') {
  mq.addEventListener('change', notify);
} else if (typeof mq.addListener === 'function') {
  mq.addListener(notify); // older Safari/Edge legacy API
}
