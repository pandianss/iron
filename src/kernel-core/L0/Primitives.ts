
export enum BudgetType {
    ENERGY = 'ENERGY',
    RISK = 'RISK',
    FISCAL = 'FISCAL'
}

export class Budget {
    constructor(
        public type: BudgetType,
        public limit: number,
        public consumed: number = 0
    ) { }

    public consume(amount: number) {
        if (this.consumed + amount > this.limit) {
            throw new Error(`Budget Exceeded: ${this.type} `);
        }
        this.consumed += amount;
    }

    public get remaining() { return this.limit - this.consumed; }
}
