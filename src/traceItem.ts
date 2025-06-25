export class TraceItemDb {
    private items: TraceItem[] = [];

    public storeTraceItems(items: TraceItem[]): void {
        this.items.push(...items);
    }

    public getTraceItems(): TraceItem[] {
        return this.items;
    }

    public clear(): void {
        this.items = [];
    }
}