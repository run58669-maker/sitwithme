export type IdleTransition = "enter" | "exit";

export interface IdleSnapshot {
  idle: boolean;
  idleSince: number | null;
  lastHumanMessageAt: number;
  nextIdleAt: number;
}

export class IdleStateMachine {
  private isIdle = false;
  private idleStartedAt: number | null = null;
  private lastHumanAt: number;

  constructor(
    private thresholdMs: number,
    startedAt = Date.now(),
  ) {
    this.validateThreshold(thresholdMs);
    this.lastHumanAt = startedAt;
  }

  setThresholdMs(thresholdMs: number, now = Date.now()): IdleTransition | null {
    this.validateThreshold(thresholdMs);
    this.thresholdMs = thresholdMs;
    return this.update(now);
  }

  forceIdle(now = Date.now()): IdleTransition | null {
    if (this.isIdle) return null;
    this.isIdle = true;
    this.idleStartedAt = now;
    return "enter";
  }

  update(now = Date.now()): IdleTransition | null {
    if (!this.isIdle && now - this.lastHumanAt >= this.thresholdMs) {
      this.isIdle = true;
      this.idleStartedAt = now;
      return "enter";
    }
    return null;
  }

  recordHumanMessage(now = Date.now()): IdleTransition | null {
    this.lastHumanAt = now;
    if (!this.isIdle) return null;
    this.isIdle = false;
    this.idleStartedAt = null;
    return "exit";
  }

  snapshot(): IdleSnapshot {
    return {
      idle: this.isIdle,
      idleSince: this.idleStartedAt,
      lastHumanMessageAt: this.lastHumanAt,
      nextIdleAt: this.lastHumanAt + this.thresholdMs,
    };
  }

  private validateThreshold(thresholdMs: number): void {
    if (!Number.isFinite(thresholdMs) || thresholdMs <= 0) {
      throw new Error("Idle threshold must be a positive number of milliseconds.");
    }
  }
}
