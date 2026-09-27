// Static artifact validation only: does not automate a browser or claim UI behavior.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = __dirname;
const html = fs.readFileSync(path.join(root, 'direction.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'direction.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'direction.css'), 'utf8');
new vm.Script(js, {filename: 'direction.js'});
new vm.Script(fs.readFileSync(path.join(root, 'study-model.js'), 'utf8'), {filename: 'study-model.js'});
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(ids.length, new Set(ids).size, 'Static IDs must be unique');
const refs = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map(match => match[1]);
let checked = 0;
for (const ref of refs) {
  if (/^https?:/.test(ref)) continue;
  if (ref.startsWith('#')) {
    if (ref.length > 1) assert(ids.includes(ref.slice(1)), `Missing anchor: ${ref}`);
    continue;
  }
  assert(fs.existsSync(path.resolve(root, ref)), `Missing local asset: ${ref}`);
  checked++;
}
for (const image of html.matchAll(/<img\b[^>]*>/g)) assert(/\balt="/.test(image[0]), 'Images need alt attributes');
assert(!html.includes('coach-client-study.png'), 'Rejected image must not appear in current board');
assert(!html.includes('coach-client-seedance-2.mp4'), 'Rejected video must not appear in current board');
const videos = [...html.matchAll(/<video\b[^>]*>/g)];
assert.equal(videos.length, 1, 'Only the reviewed new illustration video belongs here');
for (const [tag] of videos) {
  assert(/\bcontrols\b/.test(tag), 'Playback controls are required');
  assert(!/\b(?:autoplay|loop)\b/.test(tag), 'No automatic or looping playback');
  assert(/\bpreload="none"/.test(tag), 'Do not preload optional video');
}
assert(html.indexOf('src="study-model.js"') < html.indexOf('src="direction.js"'), 'Load tested model before UI');
assert(js.includes('StudyModel.createWorkout') && js.includes('StudyModel.createTransfer'), 'UI must use the tested model');
assert(css.includes('@media(prefers-reduced-motion:reduce)'), 'System reduced motion must be handled');
assert(css.includes('body.reduce dialog::backdrop'), 'Manual override must cover backdrop');
assert(!/localStorage|sessionStorage|fetch\(/.test(js), 'Demo must not write storage or request an API');
console.log(JSON.stringify({javascriptSyntax: 'pass', uniqueStaticIds: ids.length, checkedLocalReferences: checked, imageAltAttributes: 'pass', rejectedAssetsAbsent: true, reducedMotionRulesPresent: true, scope: 'Static checks only; not a browser or usability test'}, null, 2));
