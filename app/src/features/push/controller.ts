export type PushOwner = { userId: string; token: string; sessionId: string };
export type PushAdapter = {
  supported(): boolean;
  device(): Promise<string>;
  reconcile?(owner: PushOwner, device: string): Promise<void>;
  permission(): Promise<'granted' | 'denied' | 'undetermined'>;
  asked(): Promise<boolean>;
  rememberAsked(): Promise<void>;
  request(): Promise<boolean>;
  token(): Promise<string>;
  generation(): string;
  register(
    owner: PushOwner,
    device: string,
    token: string,
    generation: string,
  ): Promise<void>;
  unregister(
    owner: PushOwner,
    device: string,
    generation: string,
  ): Promise<void>;
};
export class PushController {
  private turn = 0;
  private queue: Promise<void> = Promise.resolve();
  private binding: {
    owner: PushOwner;
    device: string;
    generation: string;
    token: string;
  } | null = null;
  constructor(private readonly adapter: PushAdapter) {}
  update(owner: PushOwner | null) {
    const turn = ++this.turn;
    const run = async () => {
      if (
        this.binding &&
        (!owner ||
          owner.sessionId !== this.binding.owner.sessionId ||
          owner.userId !== this.binding.owner.userId)
      ) {
        const old = this.binding;
        await this.adapter.unregister(old.owner, old.device, old.generation);
        this.binding = null;
      }
      if (!owner || turn !== this.turn || !this.adapter.supported()) return;
      const device = await this.adapter.device();
      if (!this.binding) await this.adapter.reconcile?.(owner, device);
      if (turn !== this.turn) return;
      const permission = await this.adapter.permission();
      let allowed = permission === 'granted';
      if (
        permission === 'undetermined' &&
        !(await this.adapter.asked()) &&
        turn === this.turn
      ) {
        await this.adapter.rememberAsked();
        allowed = await this.adapter.request();
      }
      if (turn !== this.turn) return;
      if (!allowed) {
        if (this.binding) {
          await this.adapter.unregister(
            this.binding.owner,
            this.binding.device,
            this.binding.generation,
          );
          this.binding = null;
        }
        return;
      }
      const token = await this.adapter.token();
      if (turn !== this.turn) return;
      if (
        !/^(ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]{10,200}\]$/.test(
          token,
        )
      ) {
        if (this.binding) {
          await this.adapter.unregister(
            this.binding.owner,
            this.binding.device,
            this.binding.generation,
          );
          this.binding = null;
        }
        return;
      }
      if (this.binding && this.binding.token === token) {
        this.binding.owner = owner;
        return;
      }
      const generation = this.adapter.generation();
      this.binding = { owner, device, generation, token };
      try {
        await this.adapter.register(owner, device, token, generation);
      } catch {
        await this.adapter.unregister(owner, device, generation);
        this.binding = null;
        throw new Error('Push unavailable');
      }
      if (turn !== this.turn) {
        await this.adapter.unregister(owner, device, generation);
        this.binding = null;
      }
    };
    const result = this.queue.catch(() => undefined).then(run);
    this.queue = result;
    return result;
  }
  detach() {
    return this.update(null);
  }
}
