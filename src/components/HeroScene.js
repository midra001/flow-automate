/*
 * This file is part of FlowAutomate.
 *
 * Copyright © 2026 midra001
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * FlowAutomate is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * FlowAutomate is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with FlowAutomate. If not, see <https://www.gnu.org/licenses/>.
 *
 * @author midra001
 * @since 2026-09-26
 */

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { createHeroScene } from './heroEngine';

export default function HeroScene({
  pulseSignal = 0,
  style,
  background = true,
  digital = false,
  rotationSpeed = -0.075,
  assetBase = '/webgl/clean-cube/',
  layout = 'landing',
  onError,
}) {
  const mountRef = useRef(null);
  const engineRef = useRef(null);
  const errorRef = useRef(onError);
  errorRef.current = onError;

  useEffect(() => {
    if (Platform.OS !== 'web' || !mountRef.current) return;
    let engine;
    try {
      engine = createHeroScene(mountRef.current, {
        background,
        layout,
        digital,
        rotationSpeed,
        assetBase,
        onError: error => errorRef.current?.(error),
      });
      engineRef.current = engine;
    } catch (error) {
      console.error('[HeroScene] Could not create the WebGL scene:', error);
      errorRef.current?.(error);
    }
    return () => {
      engine?.dispose();
      engineRef.current = null;
    };
  }, [background, layout, rotationSpeed, assetBase]);

  useEffect(() => {
    engineRef.current?.setDigital(digital);
  }, [digital]);

  useEffect(() => {
    if (pulseSignal > 0) engineRef.current?.pulse();
  }, [pulseSignal]);

  return (
    <View style={[styles.container, style]} pointerEvents="none">
      <View ref={mountRef} style={StyleSheet.absoluteFill} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
});
