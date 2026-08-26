export class CancellationToken {
  private cancelledState = false;

  get cancelled(): boolean {
    return this.cancelledState;
  }

  cancel(): void {
    this.cancelledState = true;
  }
}

export function cancellationTokenFor(signal: AbortSignal): {
  token: CancellationToken;
  dispose: () => void;
} {
  const token = new CancellationToken();
  const onAbort = () => token.cancel();
  if (signal.aborted) onAbort();
  else signal.addEventListener("abort", onAbort, { once: true });

  return {
    token,
    dispose: () => signal.removeEventListener("abort", onAbort),
  };
}
