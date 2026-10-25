import { useEffect, useState } from 'react';

export type DeviceMode = 'phone' | 'tablet' | 'desktop';

export interface DeviceInfo {
  mode: DeviceMode;
  /** True for the compact drawer/touch shell (phones and small tablets). */
  isMobile: boolean;
  /** True for a narrow phone viewport, where secondary chrome is hidden. */
  isPhone: boolean;
  /** Pointer-based touch device, even when the viewport is wide. */
  isTouch: boolean;
  width: number;
  height: number;
}

function readDevice(): DeviceInfo {
  if (typeof window === 'undefined') {
    return { mode: 'desktop', isMobile: false, isPhone: false, isTouch: false, width: 1440, height: 900 };
  }
  const width = window.innerWidth;
  const height = window.innerHeight;
  const isPhone = width <= 620;
  const isMobile = width <= 900;
  const isTouch = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return {
    mode: isPhone ? 'phone' : isMobile ? 'tablet' : 'desktop',
    isMobile,
    isPhone,
    isTouch,
    width,
    height,
  };
}

/**
 * Device-aware shell mode. The CSS media queries do the visual work; this hook
 * adds behaviour that cannot be expressed in CSS (drawer scrims, mobile menu)
 * and exposes a data attribute for diagnostics and device-specific rules.
 */
export function useDevice(): DeviceInfo {
  const [device, setDevice] = useState<DeviceInfo>(readDevice);

  useEffect(() => {
    const update = () => setDevice(readDevice());
    const onResize = () => update();
    const onOrientation = () => update();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onOrientation);
    const coarse = window.matchMedia?.('(pointer: coarse)');
    coarse?.addEventListener?.('change', update);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onOrientation);
      coarse?.removeEventListener?.('change', update);
    };
  }, []);

  return device;
}
