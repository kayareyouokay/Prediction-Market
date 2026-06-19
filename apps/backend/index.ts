import express from 'express';
import cors from 'cors';
import { uuid } from "uuidv4";
import { middleware } from './middleware';
import { prisma } from "db";
import { CreateOrderSchema, type OrderBook } from './types';
import { object } from 'zod';
import { Prisma } from 'db/generated/prisma/client';

const app = express();

app.use(express.json());
app.use(cors());

app.post("/buy", middleware, async (req, res) => {
    const { success, data } = CreateOrderSchema.safeParse(req.body);
    const userId: string = req.userId;
    if (!success) {
        res.status(411).json({
            message: "Incorrect inputs"
        })
        return;
    }

    const originalOrderId = uuid();

    await prisma.$transaction(async tx => {
        const response = await tx.$queryRaw<{yesOrderbook: string, noOrderbook: string, id: string, totalQty: number}[]>`SELECT * FROM "Market" WHERE id=${data.marketId} FOR UPDATE;`;
        const userResponse = await tx.$queryRaw<{id: string, address: string, usdBalance: number}[]>`SELECT* FROM "User" WHERE id=${userId} FOR UPDATE;`;
        
        const user = userResponse[0];
        if (!user) {
            return;
        }
        
        const market = response[0];
        if (!market) {
            return;
        }

        const yesOrderbook: OrderBook = JSON.parse(market.yesOrderbook);
        const noOrderbook: OrderBook = JSON.parse(market.noOrderbook);

        if (data.side == "yes" && data.type == "buy") {
            const usd = data.qty * data.price;
            if (user.usdBalance < usd) {
                res.status(403).json({
                    message: "Sorry, you do not have sufficient funds in your account."
                })
                return;
            }
            let leftQty = 0;
            const prices = Object.keys(yesOrderbook).sort((a: string, b: string) => Number(a) - Number(b));
            await Promise.all(prices.map(async price => {
                if (Number(price) > data.price) {
                    return;
                }
                const {availableQty, orders} = yesOrderbook[price]!;
                await Promise.all(orders.map(async order => {
                    const matchedQty = (order.qty >= leftQty) ? leftQty : order.qty;
                    const reverseOrder = order.reverseOrder;

                    if (!reverseOrder) {
                        await prisma.position.update({
                            where: {
                                userId_marketId_type: {
                                    userId: order.userId,
                                    marketId: data.marketId,
                                    type: "Yes"
                                }
                            },
                            data: {
                                qty: {
                                    decrement: matchedQty
                                }
                            }
                        })
                        await prisma.user.update({
                            where: {
                                id: order.userId
                            },
                            data: {
                                usdBalance: {
                                    increment: Number(price) * matchedQty
                                }
                            }
                        })
                    } else {
                        await prisma.position.update({
                            where: {
                                userId_marketId_type: {
                                    userId: order.userId,
                                    marketId: data.marketId,
                                    type: "No"
                                }
                            },
                            data: {
                                qty: {
                                    increment: matchedQty
                                }
                            }
                        })
                        await prisma.user.update({
                            where: {
                                id: order.userId
                            },
                            data: {
                                usdBalance: {
                                    decrement: Number(price) * matchedQty
                                }
                            }
                        })
                    }

                        
                        await prisma.position.update({
                            where: {
                                userId_marketId_type: {
                                    userId,
                                    marketId: data.marketId,
                                    type: "Yes"
                                }
                            },
                            data: {
                                qty: {
                                    increment: matchedQty
                                }
                            }
                        })
                        await prisma.user.update({
                            where: {
                                id: userId
                            },
                            data: {
                                usdBalance: {
                                    decrement: Number(price) * matchedQty
                                }
                            }
                        })
                        leftQty -= matchedQty;
                        order.filledQty =+ matchedQty;
                        yesOrderbook[price]!.availableQty -= matchedQty;
                }))
            }))

            const oppositePrice = 100 - data.price;
            if (!noOrderbook[oppositePrice]) {
                noOrderbook[oppositePrice] = { availableQty: 0, orders: [] };
            }
            noOrderbook[oppositePrice]!.availableQty =+ leftQty;
            noOrderbook[oppositePrice]!.orders.push({
                userId: userId,
                qty: leftQty,
                filledQty: 0,
                originalOrderId: originalOrderId,
                reverseOrder: true
            })
        }

        if (data.side == "yes" && data.type == "sell") {
            const buyPrice = 100 - data.price;
            const buyQty = data.qty;

            const userPosition = await prisma.position.findFirst({
                where: {
                    userId: userId,
                    marketId: data.marketId,
                    type: "Yes"
                }
            });

            if (!userPosition) {
                return;
            }

            if (userPosition?.qty < data.qty) {
                return;
            }

            let leftQty = data.qty
        }

        await tx.market.update({
            data: {
                yesOrderbook: JSON.stringify(yesOrderbook),
                noOrderbook: JSON.stringify(noOrderbook)
            },
            where: {
                id: data.marketId
            }
        })
    })
    res.json({
        message: "Hello there"
    })
})

app.post("/sell", middleware, (req, res) => {

})

app.post("/merge", middleware, (req, res) => {

})

app.post("/split", middleware, (req, res) => {

})

app.get("/balance", middleware, (req, res) => {

})

app.get("/positions", middleware, (req, res) => {

})

app.get("/history", middleware, (req, res) => {

})

async function main() {
    try {
        await prisma.$connect();
        console.log("Database connected");
        console.log("DB URL:", process.env.DATABASE_URL);
    } catch (err) {
        console.error(err);
    }
}

main();

app.listen(3000);