export interface DeviceProfile {
  name: string;
  width: number;
  height: number;
  isMobile: boolean;
  hasTouch: boolean;
  deviceScaleFactor: number;
}

const PROFILES: Record<string, DeviceProfile> = {
  desktop: {
    name: 'desktop',
    width: 1280,
    height: 720,
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
  },
  mobile: {
    name: 'mobile',
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  },
  tablet: {
    name: 'tablet',
    width: 768,
    height: 1024,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  },
  'small-mobile': {
    name: 'small-mobile',
    width: 360,
    height: 740,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  },
};

export function getDeviceProfile(name: string): DeviceProfile | undefined {
  return PROFILES[name] ?? undefined;
}

export function listDeviceProfiles(): string[] {
  return Object.keys(PROFILES);
}

export function validateDeviceProfile(name: string): boolean {
  return name in PROFILES;
}
