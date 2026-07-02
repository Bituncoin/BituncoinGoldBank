import { ZoneId, getZoneConfig, ZoneConfig } from './zones';

export type KycLevel = 'NONE' | 'BASIC' | 'FULL';
export type UserTier = 'STANDARD' | 'GOLD' | 'PLATINUM';

export interface ZoneContext {
  userId: string;
  registeredCountry?: string; // from user profile
  gpsCountry?: string;        // from device
  ipCountry?: string;         // from IP (VPN-aware)
  kycLevel: KycLevel;
  userTier: UserTier;
}

export interface ZoneResolution {
  zoneId: ZoneId;
  nodeUrl: string;
  reason: string;
  config: ZoneConfig;
}

export class ZoneResolver {
  resolve(ctx: ZoneContext): ZoneResolution {
    const country =
      ctx.registeredCountry ??
      ctx.gpsCountry ??
      ctx.ipCountry ??
      'UNKNOWN';

    let zoneId: ZoneId;
    let reason: string;

    if (['GH', 'NG', 'KE', 'TZ', 'ZA'].includes(country)) {
      zoneId = 'AFRICA_CRYPTO_ZONE';
      reason = `country=${country}`;
    } else if (['GB', 'FR', 'DE', 'NL', 'ES', 'IT'].includes(country)) {
      zoneId = 'EU_CRYPTO_ZONE';
      reason = `country=${country}`;
    } else if (country === 'US') {
      zoneId = 'US_CRYPTO_ZONE';
      reason = `country=${country}`;
    } else if (ctx.kycLevel === 'NONE') {
      zoneId = 'GLOBAL_LIGHT_ZONE';
      reason = 'kyc=NONE';
    } else {
      zoneId = 'GLOBAL_LIGHT_ZONE';
      reason = `country=${country}`;
    }

    const config = getZoneConfig(zoneId);

    return {
      zoneId,
      nodeUrl: config.nodeUrl,
      reason,
      config,
    };
  }
}
