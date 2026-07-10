// Marker map-editor entry (loaded by editor.html, served at /editor). Reads the
// built-in world content (ZONES/CAMPS/NPCS/GROUND_OBJECTS/ROADS) as the source of
// truth, deep-clones it so editing never mutates the imported module globals, and
// mounts the Tier 0 marker editor over it.
//
// Dev-only authoring aid: it imports ONLY the flat sim data tables (allowed for a
// client-side tool, like the renderer reading sim/data), never the running Sim,
// render, or net. Its strings are English-only dev-channel text, so there is no
// i18n bootstrap here (the tool never ships to players).

import { CAMPS, GROUND_OBJECTS, NPCS, ROADS, ZONES } from '../sim/data';
import { EditorApp } from './app';
import './styles.css';

// Deep clone so editing never mutates the imported module globals (the sim data
// tables are shared, live references); the editor works on its own copy.
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function boot(): void {
  const mount = document.getElementById('editor-app');
  if (!mount) return;
  document.documentElement.lang = 'en';
  document.title = 'Map Editor - World of ClaudeCraft';
  const app = new EditorApp(mount, {
    zones: clone(ZONES),
    camps: clone(CAMPS),
    npcs: clone(NPCS),
    objects: clone(GROUND_OBJECTS),
    roads: clone(ROADS),
  });
  // Dev-only handle for debugging and E2E inspection.
  (window as unknown as { __editor?: EditorApp }).__editor = app;
}

boot();
