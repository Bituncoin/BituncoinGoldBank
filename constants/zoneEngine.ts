import { ZoneResolver, ZoneContext, ZoneResolution } from './zoneResolver';
import { ZoneRules, ZoneRuleContext, ZoneRuleDecision } from './zoneRules';

export class ZoneEngine {
  private resolver: ZoneResolver;
  private rules: ZoneRules;

  constructor() {
    this.resolver = new ZoneResolver();
    this.rules = new ZoneRules();
  }

  resolveZone(ctx: ZoneContext): ZoneResolution {
    return this.resolver.resolve(ctx);
  }

  evaluateRules(ctx: ZoneRuleContext): ZoneRuleDecision {
    return this.rules.evaluate(ctx);
  }
}
