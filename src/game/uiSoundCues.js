export function cueForClick({ sound, menuOpened, icon, command }) {
  if (sound === 'none') return null;
  if (sound) return sound;
  if (menuOpened) return 'open';
  if (icon) return 'close';
  if (command) return 'confirm';
  return 'click';
}
