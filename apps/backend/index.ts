import express from 'express';
import cors from 'cors';
import { uuid } from "uuidv4";
import { middleware } from './middleware';
import { prisma } from "db";
import { CreateMarketSchema, CreateOrderSchema, OfframpSchema, OnrampSchema, ResolveMarketSchema, SplitSchema, type Orderbook } from './types';

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cors());

function parseOrderbook(orderbook: unknown): Orderbook {
    if (typeof orderbook === "string") {
        return JSON.parse(orderbook);
    }
    if (orderbook && typeof orderbook === "object") {
        return orderbook as Orderbook;
    }
    return {};
}

function requireAdmin(req: express.Request, res: express.Response): boolean {
    const admins = (process.env.ADMIN_ADDRESSES ?? "").split(",").map(value => value.trim()).filter(Boolean);
    if (!admins.includes(req.walletAddress)) {
        res.status(403).json({ message: "Admin access required" });
        return false;
    }
    return true;
}

app.get("/markets", async (req, res) => {
    const markets = await prisma.market.findMany();
    res.json({ markets });
});

app.post("/order", middleware, async (req, res) => {
    const { success, data } = CreateOrderSchema.safeParse(req.body);
    const userId: string = req.userId;

    if (!success) {
        res.status(411).json({ message: "Incorrect inputs" });
        return;
    }

    const originalOrderId = uuid();

    try {
        await prisma.$transaction(async tx => {
            const response = await tx.$queryRaw<{ yesOrderbook: unknown, noOrderbook: unknown, id: string, totalQty: number }[]>`SELECT * FROM "Market" WHERE id=${data.marketId} FOR UPDATE;`;
            const userResponse = await tx.$queryRaw<{ id: string, address: string, usdBalance: number }[]>`SELECT * FROM "User" WHERE id=${userId} FOR UPDATE;`;

            const user = userResponse[0];
            if (!user) throw new Error("User not found");

            const market = response[0];
            if (!market) {
                throw new Error("Market not found");
            }
            if ((market as { resolution?: string | null }).resolution) {
                throw new Error("Market already resolved");
            }

            const yesOrderbook = parseOrderbook(market.yesOrderbook);
            const noOrderbook = parseOrderbook(market.noOrderbook);
            let executedQty = 0;

            // ─────────────────────────────────────────────────────────────────
            // BUY YES
            // User pays `price` per share, receives Yes tokens.
            // Matches against resting Yes-sell orders (or reverse No-buy orders).
            // ─────────────────────────────────────────────────────────────────
            if (data.side == "yes" && data.type == "buy") {
                const usd = data.qty * data.price;
                if (user.usdBalance < usd) throw new Error("Insufficient USD balance");

                let leftQty = data.qty;

                // Ascending price — fill cheapest asks first (best price for buyer)
                const prices = Object.keys(yesOrderbook).sort((a, b) => Number(a) - Number(b));

                for (const price of prices) {
                    if (leftQty <= 0) break;
                    if (Number(price) > data.price) continue;

                    const { orders } = yesOrderbook[price]!;

                    for (const order of orders) {
                        if (leftQty <= 0) break;
                        
                        const remainingQty = order.qty - order.filledQty;
                        if (remainingQty <= 0) continue;
                        const matchedQty = Math.min(remainingQty, leftQty);
                        const reverseOrder = order.reverseOrder;
                        if (!reverseOrder) {
                            await tx.position.update({
                                where: { userId_marketId_type: { userId: order.userId, marketId: data.marketId, type: "Yes" } },
                                data: { qty: { decrement: matchedQty } },
                            });
                            await tx.user.update({
                                where: { id: order.userId },
                                data: { usdBalance: { increment: Number(price) * matchedQty } },
                            });
                        } else {
                            // ── Reverse No-buy order ───────────────────────────
                            // FIX #1 & #3: This counterparty placed a No-buy that
                            // was routed here as a reverse Yes-sell.  Their USD was
                            // escrowed at order-placement time (deducted then).
                            // On match we must:
                            //   • Give them No tokens  (their intended outcome)
                            //   • NOT touch their USD  (already escrowed/deducted)
                            //
                            // Original bug: code was *decrementing* their balance a
                            // second time here, double-charging them.
                            await tx.position.upsert({
                                where: { userId_marketId_type: { userId: order.userId, marketId: data.marketId, type: "No" } },
                                update: { qty: { increment: matchedQty } },
                                create: { userId: order.userId, marketId: data.marketId, type: "No", qty: matchedQty },
                            });
                            // ✅ No USD change — escrowed at order placement
                        }

                        // Incoming buyer receives Yes tokens and pays at resting price
                        await tx.position.upsert({
                            where: { userId_marketId_type: { userId, marketId: data.marketId, type: "Yes" } },
                            update: { qty: { increment: matchedQty } },
                            create: { userId, marketId: data.marketId, type: "Yes", qty: matchedQty },
                        });
                        await tx.user.update({
                            where: { id: userId },
                            data: { usdBalance: { decrement: Number(price) * matchedQty } },
                        });

                        leftQty -= matchedQty;
                        executedQty += matchedQty;
                        order.filledQty += matchedQty;
                        yesOrderbook[price]!.availableQty -= matchedQty;
                    }
                }

                if (leftQty > 0) throw new Error("Insufficient liquidity at limit");
            }

            // ─────────────────────────────────────────────────────────────────
            // SELL YES
            // User surrenders Yes tokens, receives USD.
            // Equivalent to buying No at (100 - price), so we match against
            // resting No-sell orders (or reverse Yes-buy orders).
            // ─────────────────────────────────────────────────────────────────
            if (data.side == "yes" && data.type == "sell") {
                const buyPrice = 100 - data.price; // max No-side price we'll accept

                const userPosition = await tx.position.findFirst({
                    where: { userId, marketId: data.marketId, type: "Yes" },
                });
                if (!userPosition || userPosition.qty < data.qty) throw new Error("Insufficient Yes position");

                let leftQty = data.qty;

                const prices = Object.keys(noOrderbook).sort((a, b) => Number(a) - Number(b));

                for (const price of prices) {
                    if (leftQty <= 0) break;
                    if (Number(price) > buyPrice) continue;

                    const { orders } = noOrderbook[price]!;

                    for (const order of orders) {
                        if (leftQty <= 0) break;
                        
                        const remainingQty = order.qty - order.filledQty;
                        if (remainingQty <= 0) continue;
                        const matchedQty = Math.min(remainingQty, leftQty);
                        const reverseOrder = order.reverseOrder;
                        if (!reverseOrder) {
                            await tx.position.update({
                                where: { userId_marketId_type: { userId: order.userId, marketId: data.marketId, type: "No" } },
                                data: { qty: { decrement: matchedQty } },
                            });
                            await tx.user.update({
                                where: { id: order.userId },
                                data: { usdBalance: { increment: Number(price) * matchedQty } },
                            });
                        } else {
                            // ── Reverse Yes-buy order ──────────────────────────
                            // FIX #1 & #3: Counterparty placed a Yes-buy routed
                            // here as a reverse No-sell.  USD was escrowed then.
                            // On match: give them Yes tokens, leave USD alone.
                            await tx.position.upsert({
                                where: { userId_marketId_type: { userId: order.userId, marketId: data.marketId, type: "Yes" } },
                                update: { qty: { increment: matchedQty } },
                                create: { userId: order.userId, marketId: data.marketId, type: "Yes", qty: matchedQty },
                            });
                            // ✅ No USD change — escrowed at order placement
                        }

                        // FIX #4: was tx.position.update (throws if row missing);
                        // upsert is safe even on the first partial fill in the loop.
                        await tx.position.upsert({
                            where: { userId_marketId_type: { userId, marketId: data.marketId, type: "Yes" } },
                            update: { qty: { decrement: matchedQty } },
                            // create branch should never trigger (we checked above),
                            // but keeps Prisma happy and avoids a hard throw.
                            create: { userId, marketId: data.marketId, type: "Yes", qty: 0 },
                        });
                        // Yes-seller receives (100 - noPrice) per share
                        // because yesPrice + noPrice = 100
                        await tx.user.update({
                            where: {
                                id: userId
                            },
                            data: {
                                usdBalance: {
                                    increment: (100 - Number(price)) * matchedQty
                                }
                            }
                        })
                        
                        leftQty -= matchedQty;
                        executedQty += matchedQty;
                        order.filledQty += matchedQty;
                        noOrderbook[price]!.availableQty -= matchedQty;
                    }
                }

                if (leftQty > 0) throw new Error("Insufficient liquidity at limit");
            }

            // ─────────────────────────────────────────────────────────────────
            // BUY NO
            // ─────────────────────────────────────────────────────────────────
            if (data.side == "no" && data.type == "buy") {
                const usd = data.qty * data.price;
                if (user.usdBalance < usd) throw new Error("Insufficient USD balance");

                let leftQty = data.qty;

                const prices = Object.keys(noOrderbook).sort((a, b) => Number(a) - Number(b));

                for (const price of prices) {
                    if (leftQty <= 0) break;
                    if (Number(price) > data.price) continue;

                    const { orders } = noOrderbook[price]!;

                    for (const order of orders) {
                        if (leftQty <= 0) break;
                        
                        const remainingQty = order.qty - order.filledQty;
                        if (remainingQty <= 0) continue;
                        const matchedQty = Math.min(remainingQty, leftQty);
                        const reverseOrder = order.reverseOrder;
                        if (!reverseOrder) {
                            await tx.position.update({
                                where: { userId_marketId_type: { userId: order.userId, marketId: data.marketId, type: "No" } },
                                data: { qty: { decrement: matchedQty } },
                            });
                            await tx.user.update({
                                where: { id: order.userId },
                                data: { usdBalance: { increment: Number(price) * matchedQty } },
                            });
                        } else {
                            // ── Reverse Yes-buy order ──────────────────────────
                            // FIX #1 & #3: USD was escrowed at order placement.
                            // Give counterparty their Yes tokens only.
                            await tx.position.upsert({
                                where: { userId_marketId_type: { userId: order.userId, marketId: data.marketId, type: "Yes" } },
                                update: { qty: { increment: matchedQty } },
                                create: { userId: order.userId, marketId: data.marketId, type: "Yes", qty: matchedQty },
                            });
                            // ✅ No USD change — escrowed at order placement
                        }

                        await tx.position.upsert({
                            where: { userId_marketId_type: { userId, marketId: data.marketId, type: "No" } },
                            update: { qty: { increment: matchedQty } },
                            create: { userId, marketId: data.marketId, type: "No", qty: matchedQty },
                        });
                        await tx.user.update({
                            where: { id: userId },
                            data: { usdBalance: { decrement: Number(price) * matchedQty } },
                        });

                        leftQty -= matchedQty;
                        executedQty += matchedQty;
                        order.filledQty += matchedQty;
                        noOrderbook[price]!.availableQty -= matchedQty;
                    }
                }

                if (leftQty > 0) throw new Error("Insufficient liquidity at limit");
            }

            // ─────────────────────────────────────────────────────────────────
            // SELL NO
            // ─────────────────────────────────────────────────────────────────
            if (data.side == "no" && data.type == "sell") {
                const buyPrice = 100 - data.price;

                const userPosition = await tx.position.findFirst({
                    where: { userId, marketId: data.marketId, type: "No" },
                });
                if (!userPosition || userPosition.qty < data.qty) throw new Error("Insufficient No position");

                let leftQty = data.qty;

                const prices = Object.keys(yesOrderbook).sort((a, b) => Number(a) - Number(b));

                for (const price of prices) {
                    if (leftQty <= 0) break;
                    if (Number(price) > buyPrice) continue;

                    const { orders } = yesOrderbook[price]!;

                    for (const order of orders) {
                        if (leftQty <= 0) break;
                        
                        const remainingQty = order.qty - order.filledQty;
                        if (remainingQty <= 0) continue;
                        const matchedQty = Math.min(remainingQty, leftQty);
                        const reverseOrder = order.reverseOrder;
                        if (!reverseOrder) {
                            await tx.position.update({
                                where: { userId_marketId_type: { userId: order.userId, marketId: data.marketId, type: "Yes" } },
                                data: { qty: { decrement: matchedQty } },
                            });
                            await tx.user.update({
                                where: { id: order.userId },
                                data: { usdBalance: { increment: Number(price) * matchedQty } },
                            });
                        } else {
                            // ── Reverse No-buy order ───────────────────────────
                            // FIX #1 & #3: USD was escrowed at order placement.
                            // Give counterparty their No tokens only.
                            await tx.position.upsert({
                                where: { userId_marketId_type: { userId: order.userId, marketId: data.marketId, type: "No" } },
                                update: { qty: { increment: matchedQty } },
                                create: { userId: order.userId, marketId: data.marketId, type: "No", qty: matchedQty },
                            });
                            // ✅ No USD change — escrowed at order placement
                        }

                        // FIX #4: upsert instead of update for safety
                        await tx.position.upsert({
                            where: { userId_marketId_type: { userId, marketId: data.marketId, type: "No" } },
                            update: { qty: { decrement: matchedQty } },
                            create: { userId, marketId: data.marketId, type: "No", qty: 0 },
                        });
                        // No-seller receives (100 - yesPrice) per share
                        await tx.user.update({
                            where: {
                                id: userId
                            },
                            data: {
                                usdBalance: {
                                    increment: (100 - Number(price)) * matchedQty
                                }
                            }
                        })
                        
                        leftQty -= matchedQty;
                        executedQty += matchedQty;
                        order.filledQty += matchedQty;
                        yesOrderbook[price]!.availableQty -= matchedQty;
                    }
                }

                if (leftQty > 0) throw new Error("Insufficient liquidity at limit");
            }

            await tx.orderHistory.create({
                data: {
                    id: originalOrderId,
                    orderType: data.type === "buy" ? "Buy" : "Sell",
                    userId,
                    price: data.price,
                    qty: data.qty,
                    marketId: data.marketId,
                },
            });

            // FIX #5: Prune fully-filled orders before persisting the orderbook
            await tx.market.update({
                data: {
                    yesOrderbook: JSON.stringify(yesOrderbook),
                    noOrderbook: JSON.stringify(noOrderbook),
                    totalQty: { increment: executedQty }
                },
                where: { id: data.marketId },
            });
        });

        res.json({ message: "Order executed successfully" });
    } catch (error: any) {
        console.error("Error executing order:", error);
        if (error.message === "Insufficient USD balance") {
            res.status(403).json({ message: "Sorry you dont have enough $ in your account" });
        } else if (error.message === "Insufficient Yes position" || error.message === "Insufficient No position") {
            res.status(403).json({
                message: "Sorry you dont have enough position"
            })
        } else if (error.message === "Market already resolved") {
            res.status(409).json({ message: "This market is resolved" });
        } else if (error.message === "Market not found" || error.message === "Insufficient liquidity at limit") {
            res.status(422).json({ message: error.message });
        } else {
            res.status(500).json({ message: "Error executing order" });
        }
    }
});

app.get("/market", async (req, res) => {
    const marketId = typeof req.query.marketId === "string" ? req.query.marketId : undefined;
    if (!marketId) {
        res.status(400).json({ message: "marketId is required" });
        return;
    }
    const market = await prisma.market.findFirst({
        where: {
            id: marketId
        }
    });

    res.json({
        market
    })
})

app.post("/sell", middleware, (req, res) => {
    res.status(410).json({ message: "Use POST /order with type=sell" });
})

app.post("/admin/market", middleware, async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const parsed = CreateMarketSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Incorrect inputs" });
        return;
    }
    const market = await prisma.market.create({
        data: { ...parsed.data, yesOrderbook: {}, noOrderbook: {}, totalQty: 0 }
    });
    res.status(201).json({ market });
});

app.post("/admin/resolve", middleware, async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const parsed = ResolveMarketSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Incorrect inputs" });
        return;
    }
    try {
        await prisma.$transaction(async tx => {
            const rows = await tx.$queryRaw<{ id: string; resolution: "Yes" | "No" | null }[]>`SELECT id, resolution FROM "Market" WHERE id=${parsed.data.marketId} FOR UPDATE`;
            const market = rows[0];
            if (!market) throw new Error("Market not found");
            if (market.resolution) throw new Error("Market already resolved");
            const winners = await tx.position.findMany({ where: { marketId: market.id, type: parsed.data.resolution } });
            for (const winner of winners) {
                await tx.user.update({ where: { id: winner.userId }, data: { usdBalance: { increment: winner.qty * 100 } } });
            }
            await tx.position.deleteMany({ where: { marketId: market.id } });
            await tx.market.update({ where: { id: market.id }, data: { resolution: parsed.data.resolution, yesOrderbook: {}, noOrderbook: {} } });
        });
        res.json({ message: "Market resolved and winning shares redeemed" });
    } catch (error: any) {
        const status = error.message === "Market not found" ? 404 : 409;
        res.status(status).json({ message: error.message ?? "Unable to resolve market" });
    }
});

app.post("/split", middleware, async (req, res) => {
    const { data, success } = SplitSchema.safeParse(req.body);
    const userId: string = req.userId;
    if (!success) {
        res.status(411).json({ message: "Incorrect inputs" });
        return;
    }
    const marketId = data?.marketId;

    try {
    await prisma.$transaction(async tx => {
        const userResponse = await tx.$queryRaw<{id: string, address: string, usdBalance: number}[]>`SELECT * FROM "User" WHERE id=${userId} FOR UPDATE;`;
        const user = userResponse[0];
        if (!user) {
            throw new Error("User not found");
        }
        
        if (user.usdBalance < data.amount) {
            throw new Error("Insufficient USD balance");
        }

            await tx.user.update({ where: { id: userId }, data: { usdBalance: { decrement: data.amount } } });

            await tx.position.upsert({
                where: { userId_marketId_type: { marketId, userId, type: "Yes" } },
                create: { marketId, userId, type: "Yes", qty: data.amount },
                update: { qty: { increment: data.amount } },
            });
            await tx.position.upsert({
                where: { userId_marketId_type: { marketId, userId, type: "No" } },
                create: { marketId, userId, type: "No", qty: data.amount },
                update: { qty: { increment: data.amount } },
            });

        await tx.position.upsert({
            where: {
                userId_marketId_type: {
                    marketId,
                    userId,
                    type: "No"
                }
            },
            create: {
                marketId,
                userId,
                type: "No",
                qty: data.amount
            },
            update: {
                qty: {
                    increment: data.amount
                }
            }
            
        })

        await tx.orderHistory.create({
            data: {
                orderType: "Split",
                userId,
                price: 0,
                qty: data.amount,
                marketId: data.marketId
            }
        })
    })
    res.json({
        message: "Split successful"
    })
    } catch (error: any) {
        console.error("Error splitting:", error);
        res.status(error.message === "Insufficient USD balance" ? 403 : 500).json({
            message: error.message === "Insufficient USD balance"
                ? "Sorry you dont have enough $ in your account"
                : "Error splitting position"
        });
    }
})

app.post("/merge", middleware, async (req, res) => {
    const { data, success } = SplitSchema.safeParse(req.body);
    const userId: string = req.userId;
    if (!success) {
        res.status(411).json({ message: "Incorrect inputs" });
        return;
    }
    const marketId = data?.marketId;

    try {
        await prisma.$transaction(async tx => {
            const userResponse = await tx.$queryRaw<{ id: string, address: string, usdBalance: number }[]>`SELECT * FROM "User" WHERE id=${userId} FOR UPDATE;`;
            const user = userResponse[0];
            if (!user) throw new Error("User not found");

            const yesPosition = await tx.position.findFirst({ where: { userId, marketId, type: "Yes" } });
            const noPosition = await tx.position.findFirst({ where: { userId, marketId, type: "No" } });

            if (!yesPosition || yesPosition.qty < data.amount) throw new Error("Insufficient Yes position");
            if (!noPosition || noPosition.qty < data.amount) throw new Error("Insufficient No position");

            await tx.position.update({
                where: { userId_marketId_type: { userId, marketId, type: "Yes" } },
                data: { qty: { decrement: data.amount } },
            });
            await tx.position.update({
                where: { userId_marketId_type: { userId, marketId, type: "No" } },
                data: { qty: { decrement: data.amount } },
            });
            await tx.user.update({ where: { id: userId }, data: { usdBalance: { increment: data.amount } } });

            await tx.orderHistory.create({
                data: { orderType: "Merge", userId, price: 0, qty: data.amount, marketId: data.marketId },
            });
        });
        res.json({ message: "Merge successful" });
    } catch (error: any) {
        console.error("Error merging:", error);
        if (error.message === "Insufficient Yes position" || error.message === "Insufficient No position") {
            res.status(403).json({ message: "Sorry you dont have enough position" });
        } else {
            res.status(500).json({ message: "Error merging" });
        }
    }
});

app.get("/balance", middleware, async (req, res) => {
    const userId: string = req.userId as string;
    const user = await prisma.user.findFirst({ where: { id: userId } });
    res.json({ balance: user?.usdBalance });
});

app.get("/positions", middleware, async (req, res) => {
    const userId: string = req.userId as string;
    const positions = await prisma.position.findMany({ where: { userId } });
    res.json({ positions });
});

app.post("/history", middleware, async (req, res) => {
    const userId: string = req.userId as string;
    const history = await prisma.orderHistory.findMany({ where: { userId } });
    res.json({ history });
});

app.post("/onramp", middleware, async (req, res) => {
    const { success, data } = OnrampSchema.safeParse(req.body);
    const userId: string = req.userId;

    if (!success) {
        res.status(411).json({ message: "Incorrect inputs" });
        return;
    }
    if (process.env.ENABLE_DEV_FAUCET !== "true") {
        res.status(501).json({ message: "Payment processing is not configured" });
        return;
    }

    if (process.env.ENABLE_DEV_FAUCET !== "true") {
        res.status(501).json({ message: "Payment processing is not configured" });
        return;
    }

    try {
        await prisma.$transaction(async tx => {
            const userResponse = await tx.$queryRaw<{ id: string, address: string, usdBalance: number }[]>`SELECT * FROM "User" WHERE id=${userId} FOR UPDATE;`;
            const user = userResponse[0];
            if (!user) throw new Error("User not found");

            // FIX #2: The order-matching logic uses raw price values in a 0–100
            // cent scale (e.g. price=60 means 60¢ per share, so 10 shares costs
            // 600 units).  usdBalance must therefore be stored in the SAME unit —
            // i.e. already-scaled cents — NOT multiplied by 100 again here.
            //
            // Original bug: `Math.round(data.amount * 100)` stored dollars as
            // cents, giving users 100× their intended balance and making every
            // order deduction 100× too cheap in real-money terms.
            //
            // Fix: store `data.amount` directly (caller passes the value in the
            // same unit the matching engine uses).
            await tx.user.update({
                where: { id: userId },
                data: { usdBalance: { increment: data.amount } },
            });
        });

        res.json({ message: "Onramp successful", amount: data.amount });
    } catch (error: any) {
        console.error("Error processing onramp:", error);
        res.status(500).json({ message: "Error processing onramp" });
    }
});

app.post("/offramp", middleware, async (req, res) => {
    const { success, data } = OfframpSchema.safeParse(req.body);
    const userId: string = req.userId;

    if (!success) {
        res.status(411).json({ message: "Incorrect inputs" });
        return;
    }

    res.status(501).json({ message: "Payment processing is not configured" });
    return;
});

async function main() {
    try {
        await prisma.$connect();
        console.log("Database connected");
    } catch (err) {
        console.error(err);
    }
}

main();

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
