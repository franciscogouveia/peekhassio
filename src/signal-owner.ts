export class SignalOwner {
    readonly #signals = new Set<number>();

    add(signal: number): void {
        this.#signals.add(signal);
    }

    disconnectAll(disconnect: (signal: number) => void): void {
        const signals = [...this.#signals];
        this.#signals.clear();
        signals.forEach(disconnect);
    }
}
