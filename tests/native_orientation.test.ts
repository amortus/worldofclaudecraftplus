// Pins the native wrappers' orientation/fullscreen config. Both wrappers are
// landscape-locked: Android via sensorLandscape, iOS/iPadOS via a landscape-only
// UISupportedInterfaceOrientations. We keep the extra UIRequiresFullScreen assert
// (App Store review of a fullscreen game needs it) on top of upstream's checks.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8').replace(/\r\n/g, '\n');

describe('native mobile orientation', () => {
  it('locks Android to landscape in the native app manifest', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    expect(manifest).toContain('android:name=".MainActivity"');
    expect(manifest).toContain('android:screenOrientation="sensorLandscape"');
  });

  it('allows only landscape orientations on iOS and iPadOS', () => {
    const plist = read('ios/App/App/Info.plist');
    // Required for App Store review of a fullscreen game: without it, iPad
    // multitasking demands support for ALL orientations.
    expect(plist).toMatch(/<key>UIRequiresFullScreen<\/key>\s*<true\/>/);
    const orientationBlocks = [
      plist.match(/<key>UISupportedInterfaceOrientations<\/key>\s*<array>([\s\S]*?)<\/array>/),
      plist.match(/<key>UISupportedInterfaceOrientations~ipad<\/key>\s*<array>([\s\S]*?)<\/array>/),
    ];

    for (const block of orientationBlocks) {
      expect(block?.[1]).toContain('UIInterfaceOrientationLandscapeLeft');
      expect(block?.[1]).toContain('UIInterfaceOrientationLandscapeRight');
      expect(block?.[1]).not.toContain('UIInterfaceOrientationPortrait');
      expect(block?.[1]).not.toContain('UIInterfaceOrientationPortraitUpsideDown');
    }
  });
});
