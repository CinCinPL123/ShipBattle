'use strict';
// Ładuje wspólny kod gry (public/shared) jako zwykłe skrypty - te same pliki działają w przeglądarce.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SHARED = path.join(__dirname, '..', 'public', 'shared');
const FILES = ['core.js', 'defs.js', 'design.js', 'sim/ship.js', 'sim/ai.js', 'sim/world.js'];
let loaded = false;

module.exports = function loadShared() {
  if (loaded) return;
  for (const f of FILES) {
    const file = path.join(SHARED, f);
    vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
  }
  loaded = true;
};
module.exports.FILES = FILES;
