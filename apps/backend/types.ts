import z from "zod";

export const CreateOrderSchema = z.object({
    marketId: z.string(),
    side: z.enum(["yes", "no"]),
    type: z.enum(["buy", "sell"]),
    price: z.int(), // $0.10 => 10
    qty: z.int(),   // 1 => 1qty
})

export type OrderBook = {[key: string]: {
    availableQty: number,
    orders: {userId: string, qty: number, filledQty: number, originalOrderId: string, reverseOrder: boolean}[]
}}

export const SplitSchema = z.object({
    marketId: z.string(),
    amount: z.number() // 1 => 1
})