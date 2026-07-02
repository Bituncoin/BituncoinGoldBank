import { ZoneId, getZoneConfig } from './zones';

export type ActionType = 'SEND' | 'SWAP' | 'WITHDRAW' | 'DEPOSIT';

export interface ZoneRuleContext {
  userId: string;
  zoneId: ZoneId;
  assetId: string;
  amount: number;
  action: ActionType;
}

export interface ZoneRuleDecision {
  allowed: boolean;
  maxAmount?: number;
  reason?: string;
}

export class ZoneRules {
  evaluate(ctx: ZoneRuleContext): ZoneRuleDecision {
    const config = getZoneConfig(ctx.zoneId);

    let limit: number | undefined;

    if (ctx.action === 'SEND') {
      limit = config.maxSendAmount;
    } else if (ctx.action === 'SWAP') {
      limit = config.maxSwapAmount;
    } else if (ctx.action === 'WITHDRAW') {
      limit = config.maxWithdrawAmount;
    }

    if (limit !== undefined && ctx.amount > limit) {
      return {
        allowed: false,
        maxAmount: limit,
        reason: `${ctx.action} limit exceeded for zone=${ctx.zoneId}`,
      };
    }

    // Gold coins: extra global limit across all zones
    if (ctx.assetId.endsWith('_GOLD') && ctx.amount > 5000) {
      return {
        allowed: false,
        maxAmount: 5000,
        reason: 'Global gold coin transaction limit exceeded',
      };
    }

    return { allowed: true };
  }
}
