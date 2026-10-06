import { cueForClick } from './uiSoundCues.js';
import clickUrl from '../assets/audio/ui/click.ogg';
import closeUrl from '../assets/audio/ui/close.ogg';
import confirmUrl from '../assets/audio/ui/confirm.ogg';
import openUrl from '../assets/audio/ui/open.ogg';
import toggleUrl from '../assets/audio/ui/toggle.ogg';

const CLIPS = {
  click: clickUrl,
  close: closeUrl,
  confirm: confirmUrl,
  open: openUrl,
  toggle: toggleUrl,
};

const enabled = true;
let clickDepth = 0;
let menuOpened = false;
let installed = false;

export function playUiSound(name) {
  const url = CLIPS[name];
  if (!enabled || !url) return;
  const audio = new Audio(url);
  audio.volume = name === 'confirm' ? 0.38 : 0.28;
  audio.play().catch(() => {});
}

export function noteMenuOpened() {
  if (clickDepth > 0) {
    menuOpened = true;
    return;
  }
  playUiSound('open');
}

export function installUiSounds() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('pointerdown', () => {
    const context = new AudioContext();
    if (context.state === 'suspended') context.resume().catch(() => {});
  }, { capture: true, once: true });
  window.addEventListener('click', () => {
    clickDepth += 1;
  }, true);
  window.addEventListener('click', (event) => {
    const control = event.target instanceof Element
      ? event.target.closest('button, a, [role="button"], summary')
      : null;
    const snapshot = control && !control.matches(':disabled') ? {
      sound: control.getAttribute('data-sound'),
      icon: control.classList.contains('command-icon-button'),
      command: control.classList.contains('command-button'),
    } : null;
    window.setTimeout(() => {
      clickDepth = Math.max(0, clickDepth - 1);
      if (!snapshot) {
        menuOpened = false;
        return;
      }
      const cue = cueForClick({ ...snapshot, menuOpened });
      menuOpened = false;
      if (cue) playUiSound(cue);
    }, 0);
  });
  window.addEventListener('change', (event) => {
    const control = event.target;
    if (!(control instanceof Element)) return;
    if (control.getAttribute('data-sound') === 'none') return;
    if (control.matches('input[type="checkbox"], select')) playUiSound('toggle');
  });
}
