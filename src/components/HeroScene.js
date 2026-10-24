// Replace your existing src/components/HeroScene.js with this file.
// Place heroEngine.js, originalCubeData.js, and originalCubeMaterial.js beside it.
// Requires: three and react-native-web. No runtime GLB/Draco decoder is needed.
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
