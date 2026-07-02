/**
 * BTNGText — Drop-in replacement for React Native <Text>
 *
 * Permanently disables OS-level font scaling (allowFontScaling={false})
 * so the bank UI never breaks when users change system font size in
 * Accessibility settings on iOS or Android.
 *
 * Our theme's mFont() already computes the correct size for every
 * device at boot — this wrapper just locks that in.
 *
 * Usage:
 *   import { BTNGText as Text } from '@/components/ui/BTNGText';
 *   <Text style={styles.title}>Hello</Text>
 *
 * Works as a 100% drop-in for <Text> — all props are passed through.
 */

import React from 'react';
import { Text, TextProps, Platform } from 'react-native';

export const BTNGText: React.FC<TextProps> = ({ style, ...props }) => (
  <Text
    allowFontScaling={false}
    style={[
      Platform.OS === 'android' ? { includeFontPadding: false } : undefined,
      style,
    ]}
    {...props}
  />
);

export default BTNGText;
