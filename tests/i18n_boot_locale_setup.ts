// Pin the boot locale to English for the test suite.
//
// This fork ships pt_BR as the default a visitor gets (src/ui/i18n.ts), diverging
// from upstream, whose suite this tree adopted wholesale. That suite asserts English
// copy ("Vengeance!", not "Vinganca!") and en-US number formatting (1,250, not
// 1.250), so under the fork default hundreds of files fail on locale alone while the
// product is behaving exactly as intended.
//
// The fix belongs in the suite, never in the product: changing the shipped default to
// please a test would hand every Brazilian visitor an English UI. i18n.ts reads
// __WOC_BOOT_LOCALE__ once at module init and ignores anything that is not a
// supported code, and setupFiles run before the test file's imports are evaluated, so
// the assignment below lands before that read.
//
// A test that cares about locale selection still calls setLanguage() itself; this only
// fixes where every file STARTS. Deliberately not writing localStorage: several suites
// assert behavior for a visitor with no stored preference.
(globalThis as { __WOC_BOOT_LOCALE__?: string }).__WOC_BOOT_LOCALE__ = 'en';
