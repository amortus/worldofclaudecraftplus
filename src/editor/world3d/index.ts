// Public surface of the 3D editor subsystem. Dynamically imported by the editor app
// shell (app.ts) only when the operator switches to 3D, so the lightweight 2D editor
// never pays the Three.js + renderer-module bundle cost up front.

export { Editor3dView, type Editor3dOptions } from './view';
