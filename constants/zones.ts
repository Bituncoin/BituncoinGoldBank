// Central definition of all global zones and their node URLs + limits

export type ZoneId =
  | 'AFRICA_CRYPTO_ZONE'
  | 'EU_CRYPTO_ZONE'
  | 'US_CRYPTO_ZONE'
  | 'GLOBAL_LIGHT_ZONE';

export interface ZoneConfig {
  id: ZoneId;
  nodeUrl: string;
  maxSendAmount: number;
  maxSwapAmount: number;
  maxWithdrawAmount: number;
}

export const ZONES: ZoneConfig[] = [
  {
    id: 'AFRICA_CRYPTO_ZONE',
    nodeUrl: 'https://africa.btng-node',
    maxSendAmount: 10000,
    maxSwapAmount: 15000,
    maxWithdrawAmount: 8000,
  },
  {
    id: 'EU_CRYPTO_ZONE',
    nodeUrl: 'https://eu.btng-node',
    maxSendAmount: 8000,
    maxSwapAmount: 12000,
    maxWithdrawAmount: 7000,
  },
  {
    id: 'US_CRYPTO_ZONE',
    nodeUrl: 'https://us.btng-node',
    maxSendAmount: 12000,
    maxSwapAmount: 18000,
    maxWithdrawAmount: 9000,
  },
  {
    id: 'GLOBAL_LIGHT_ZONE',
    nodeUrl: 'https://global.btng-node',
    maxSendAmount: 1000,
    maxSwapAmount: 2000,
    maxWithdrawAmount: 500,
  },
];

export function getZoneConfig(id: ZoneId): ZoneConfig {
  const zone = ZONES.find(z => z.id === id);
  if (!zone) {
    throw new Error(`Zone config not found for id=${id}`);
  }
  return zone;
}
