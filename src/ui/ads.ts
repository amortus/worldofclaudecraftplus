// AdMob integration for the native Android/iOS builds.
// All calls are no-ops when VITE_NATIVE_APP is not set (web build).
// The @capacitor-community/admob package is loaded via static import but guarded
// behind IS_NATIVE so the web bundle never executes any AdMob calls.
import { AdMob, RewardAdPluginEvents } from '@capacitor-community/admob';

export type AdRewardType = 'xp_boost' | 'death_revive';

// Resolved from the build env -- mirrors NATIVE_APP in src/net/online.ts but
// declared here to avoid the ui/ -> net/ import direction violation.
const IS_NATIVE = String(import.meta.env.VITE_NATIVE_APP ?? '') === '1';

// Production ad unit IDs. Replace with test IDs during development:
// Rewarded:     ca-app-pub-3940256099942544/5224354917
// Interstitial: ca-app-pub-3940256099942544/1033173712
const AD_UNIT_XP_BOOST    = 'ca-app-pub-2926713394150469/3789784344';
const AD_UNIT_DEATH_REVIVE = 'ca-app-pub-2926713394150469/7942827941';
const AD_UNIT_ZONE         = 'ca-app-pub-2926713394150469/3676279873';

// Called by main.ts after auth so ads.ts never imports from net/.
let rewardCallback: ((type: AdRewardType) => Promise<void>) | null = null;

export function setAdRewardCallback(fn: (type: AdRewardType) => Promise<void>): void {
  rewardCallback = fn;
}

// Zone interstitial frequency cap: every 3rd transition, at most 1 per hour.
let zoneTransitionCount = 0;
let lastInterstitialMs = 0;
const INTERSTITIAL_EVERY_N = 3;
const INTERSTITIAL_MIN_INTERVAL_MS = 3_600_000;

export async function initAds(): Promise<void> {
  if (!IS_NATIVE) return;
  try {
    await AdMob.initialize({ initializeForTesting: false });
  } catch {
    // Not available in web context; silently skip.
  }
}

// Shows a rewarded video ad. Resolves true if the user earned the reward
// (watched to completion). Does NOT apply the reward automatically -- the
// caller must call claimAdReward() when ready. For death revive this means
// waiting for the player to click the confirm button; for XP boost the caller
// claims immediately after the ad closes.
export async function showRewardedAd(type: AdRewardType): Promise<boolean> {
  if (!IS_NATIVE) return false;
  const adId = type === 'xp_boost' ? AD_UNIT_XP_BOOST : AD_UNIT_DEATH_REVIVE;

  try {
    await AdMob.prepareRewardVideoAd({ adId });
  } catch {
    return false;
  }

  return new Promise<boolean>((resolve) => {
    let earned = false;
    const pending: Array<Promise<{ remove(): Promise<void> }>> = [];

    const cleanup = (result: boolean): void => {
      Promise.all(pending)
        .then((hs) => hs.forEach((h) => void h.remove().catch(() => {})))
        .catch(() => {});
      resolve(result);
    };

    pending.push(AdMob.addListener(RewardAdPluginEvents.Rewarded, () => { earned = true; }));
    pending.push(AdMob.addListener(RewardAdPluginEvents.Dismissed, () => { cleanup(earned); }));
    pending.push(AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => cleanup(false)));

    AdMob.showRewardVideoAd().catch(() => cleanup(false));
  });
}

// Sends the earned reward to the server. For XP boost, call immediately after
// showRewardedAd returns true. For death revive, call only after the player
// clicks the green "Revive Here!" button so they control when they respawn.
export async function claimAdReward(type: AdRewardType): Promise<void> {
  if (!rewardCallback) return;
  try { await rewardCallback(type); } catch { /* best-effort */ }
}

// Shows a zone-transition interstitial, subject to frequency and time caps.
// Call this from the loading screen / zone transition hook in main.ts.
export async function tryShowZoneInterstitial(): Promise<void> {
  if (!IS_NATIVE) return;
  zoneTransitionCount++;
  if (zoneTransitionCount % INTERSTITIAL_EVERY_N !== 0) return;
  const now = Date.now();
  if (now - lastInterstitialMs < INTERSTITIAL_MIN_INTERVAL_MS) return;
  lastInterstitialMs = now;
  try {
    await AdMob.prepareInterstitial({ adId: AD_UNIT_ZONE });
    await AdMob.showInterstitial();
  } catch { /* best-effort */ }
}
