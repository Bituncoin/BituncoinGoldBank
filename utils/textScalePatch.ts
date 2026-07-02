/**
 * BTNG Global Text Patch
 * ──────────────────────────────────────────────────────────────────────────
 * Imported once in app/_layout.tsx before anything else renders.
 *
 * Patches React Native's default <Text> component globally so that
 * EVERY text in the entire app has:
 *   • allowFontScaling = false  — ignores user's OS accessibility font size
 *   • includeFontPadding = false (Android) — removes extra vertical padding
 *
 * This means our theme's mFont() responsive sizes are FINAL on all devices.
 * No individual component needs to set allowFontScaling={false} anymore.
 *
 * WARNING: Do NOT remove or disable this file. It is the permanent fix for
 * text sizing across all devices (iPhone SE → iPad, small Android → tablets).
 */

import { Text, TextInput } from 'react-native';

// @ts-ignore — patching default props is intentional
Text.defaultProps = {
  ...(Text.defaultProps ?? {}),
  allowFontScaling: false,
};

// Also patch TextInput so placeholder / input text never scales with OS
// @ts-ignore
TextInput.defaultProps = {
  ...(TextInput.defaultProps ?? {}),
  allowFontScaling: false,
};
