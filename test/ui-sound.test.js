import assert from 'node:assert/strict';
import test from 'node:test';

import { cueForClick } from '../src/game/uiSoundCues.js';

test('menus, submits, and ordinary controls pick different cues', () => {
  assert.equal(cueForClick({ sound: 'open', menuOpened: false, icon: false, command: false }), 'open');
  assert.equal(cueForClick({ sound: null, menuOpened: true, icon: false, command: true }), 'open');
  assert.equal(cueForClick({ sound: null, menuOpened: false, icon: true, command: false }), 'close');
  assert.equal(cueForClick({ sound: null, menuOpened: false, icon: false, command: true }), 'confirm');
  assert.equal(cueForClick({ sound: null, menuOpened: false, icon: false, command: false }), 'click');
  assert.equal(cueForClick({ sound: 'none', menuOpened: true, icon: false, command: true }), null);
});
