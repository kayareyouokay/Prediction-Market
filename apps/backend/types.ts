import z from "zod";

export const CreateOrderSchema = z.object({
    marketId: z.string().uuid(),
    side: z.enum(["yes", "no"]),
    type: z.enum(["buy", "sell"]),
    price: z.int().min(1).max(99), // $0.10 => 10
    qty: z.int().positive(),   // 1 => 1qty
})

export type Orderbook = {[key: string]: {
    availableQty: number,
    orders: {userId: string, qty: number, filledQty: number, originalOrderId: string, reverseOrder: boolean}[]
}}

export const SplitSchema = z.object({
    marketId: z.string().uuid(),
    amount: z.int().positive() // collateral cents / paired shares
})

export const OnrampSchema = z.object({
    amount: z.number().finite().positive().max(10_000) // amount in USD (e.g., 100.50)
})

export const OfframpSchema = z.object({
    amount: z.number().finite().positive().max(10_000) // amount in USD (e.g., 100.50)
})

export const CreateMarketSchema = z.object({
    title: z.string().trim().min(8).max(240),
    description: z.string().trim().min(20).max(5_000),
    resolutionDescription: z.string().trim().min(20).max(5_000),
});

export const ResolveMarketSchema = z.object({
    marketId: z.string().uuid(),
    resolution: z.enum(["Yes", "No"]),
});
