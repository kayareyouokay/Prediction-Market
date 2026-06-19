import express from 'express';
import cors from 'cors';
import { uuid } from "uuidv4";
import { middleware } from './middleware';
import { prisma } from "db";
import { CreateOrderSchema, OfframpSchema, OnrampSchema, SplitSchema, type Orderbook } from './types';
import { object } from 'zod';
import { Prisma } from 'db/generated/prisma/client';

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

app.get("/markets", async (req, res) => {
    const markets = await prisma.market.findMany();
    res.json({
        markets
    });
});

app.post("/order", middleware, async (req, res) => {
    const { success, data } = CreateOrderSchema.safeParse(req.body);
    const userId: string = req.userId;

    if (!success) {
        res.status(411).json({
            message: "Incorrect inputs"
        })
        return;
    }

    const originalOrderId = uuid();
    
    try {
        await prisma.$transaction(async tx => {
            const response = await tx.$queryRaw<{yesOrderbook: unknown, noOrderbook: unknown, id: string, totalQty: number}[]>`SELECT * FROM "Market" WHERE id=${data.marketId} FOR UPDATE;`;
            const userResponse = await tx.$queryRaw<{id: string, address: string, usdBalance: number}[]>`SELECT * FROM "User" WHERE id=${userId} FOR UPDATE;`;

            const user = userResponse[0];
            if (!user) {
                throw new Error("User not found");
            }
            const market = response[0];
            if (!market) {
                throw new Error("Market not found");
            }

            const yesOrderbook = parseOrderbook(market.yesOrderbook);
            const noOrderbook = parseOrderbook(market.noOrderbook);

            if (data.side == "yes" && data.type == "buy") {
                const usd = data.qty * data.price;
                if (user.usdBalance < usd) {
                    throw new Error("Insufficient USD balance");
                }

                let leftQty = data.qty;

                const prices = Object.keys(yesOrderbook).sort((a: string, b: string) => Number(a) - Number(b));

                for (const price of prices) {
                    if (Number(price) > data.price) {
                        continue;
                    }
                    const { orders } = yesOrderbook[price]!;
                    
                    for (const order of orders) {
                        if (leftQty <= 0) break;
                        
                        const matchedQty = order.qty >= leftQty ? leftQty : order.qty;
                        const reverseOrder = order.reverseOrder;
                        if (!reverseOrder) {
                            await tx.position.update({
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
                                },
                            })
                            await tx.user.update({
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
                            await tx.position.update({
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
                                },
                            })
                            await tx.user.update({
                                where: {
                                    id: order.userId
                                },
                                data: {
                                    usdBalance: {
                                        decrement: (100 - Number(price)) * matchedQty
                                    }
                                }
                            })
                        }
                        await tx.position.upsert({
                            where: {
                                userId_marketId_type: {
                                    userId,
                                    marketId: data.marketId,
                                    type: "Yes"
                                }
                            },
                            update: {
                                qty: {
                                    increment: matchedQty 
                                }
                            },
                            create: {
                                userId,
                                marketId: data.marketId,
                                type: "Yes",
                                qty: matchedQty
                            }
                        })

                        await tx.user.update({
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
                        order.filledQty += matchedQty;
                        yesOrderbook[price]!.availableQty -= matchedQty;
                    }
                }

                if (leftQty > 0) {
                    const oppositePrice = 100 - data.price;
                    if (!noOrderbook[oppositePrice]) {
                        noOrderbook[oppositePrice] = { availableQty: 0, orders: [] };
                    }
                    
                    noOrderbook[oppositePrice]!.availableQty += leftQty;
                    noOrderbook[oppositePrice]!.orders.push({qty: leftQty, userId, filledQty: 0, originalOrderId, reverseOrder: true});   
                }
            }

            if (data.side == "yes" && data.type == "sell") {
                const buyPrice = 100 - data.price;

                const userPosition = await tx.position.findFirst({
                    where: {
                        userId: userId,
                        marketId: data.marketId,
                        type: "Yes"
                    }
                });

                if (!userPosition || userPosition.qty < data.qty) {
                    throw new Error("Insufficient Yes position");
                }

                let leftQty = data.qty;

                const prices = Object.keys(noOrderbook).sort((a: string, b: string) => Number(a) - Number(b));

                for (const price of prices) {
                    if (Number(price) > buyPrice) {
                        continue;
                    }
                    const { orders } = noOrderbook[price]!;
                    
                    for (const order of orders) {
                        if (leftQty <= 0) break;
                        
                        const matchedQty = order.qty >= leftQty ? leftQty : order.qty;
                        const reverseOrder = order.reverseOrder;
                        if (!reverseOrder) {
                            await tx.position.update({
                                where: {
                                    userId_marketId_type: {
                                        userId: order.userId,
                                        marketId: data.marketId,
                                        type: "No"
                                    }
                                },
                                data: {
                                    qty: {
                                        decrement: matchedQty 
                                    }
                                },
                            })
                            await tx.user.update({
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
                            await tx.position.update({
                                where: {
                                    userId_marketId_type: {
                                        userId: order.userId,
                                        marketId: data.marketId,
                                        type: "Yes"
                                    }
                                },
                                data: {
                                    qty: {
                                        increment: matchedQty 
                                    }
                                },
                            })
                            await tx.user.update({
                                where: {
                                    id: order.userId
                                },
                                data: {
                                    usdBalance: {
                                        decrement: (100 - Number(price)) * matchedQty
                                    }
                                }
                            })
                        }
                        await tx.position.update({
                            where: {
                                userId_marketId_type: {
                                    userId,
                                    marketId: data.marketId,
                                    type: "Yes"
                                }
                            },
                            data: {
                                qty: {
                                    decrement: matchedQty 
                                }
                            },
                        })

                        await tx.user.update({
                            where: {
                                id: userId
                            },
                            data: {
                                usdBalance: {
                                    increment: Number(price) * matchedQty
                                }
                            }
                        })
                        
                        leftQty -= matchedQty;
                        order.filledQty += matchedQty;
                        noOrderbook[price]!.availableQty -= matchedQty;
                    }
                }

                if (leftQty > 0) {
                    if (!yesOrderbook[data.price]) {
                        yesOrderbook[data.price] = { availableQty: 0, orders: [] };
                    }
                    
                    yesOrderbook[data.price]!.availableQty += leftQty;
                    yesOrderbook[data.price]!.orders.push({qty: leftQty, userId, filledQty: 0, originalOrderId, reverseOrder: false});   
                }
            }

            if (data.side == "no" && data.type == "buy") {
                const usd = data.qty * data.price;
                if (user.usdBalance < usd) {
                    throw new Error("Insufficient USD balance");
                }

                let leftQty = data.qty;

                const prices = Object.keys(noOrderbook).sort((a: string, b: string) => Number(a) - Number(b));

                for (const price of prices) {
                    if (Number(price) > data.price) {
                        continue;
                    }
                    const { orders } = noOrderbook[price]!;
                    
                    for (const order of orders) {
                        if (leftQty <= 0) break;
                        
                        const matchedQty = order.qty >= leftQty ? leftQty : order.qty;
                        const reverseOrder = order.reverseOrder;
                        if (!reverseOrder) {
                            await tx.position.update({
                                where: {
                                    userId_marketId_type: {
                                        userId: order.userId,
                                        marketId: data.marketId,
                                        type: "No"
                                    }
                                },
                                data: {
                                    qty: {
                                        decrement: matchedQty 
                                    }
                                },
                            })
                            await tx.user.update({
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
                            await tx.position.update({
                                where: {
                                    userId_marketId_type: {
                                        userId: order.userId,
                                        marketId: data.marketId,
                                        type: "Yes"
                                    }
                                },
                                data: {
                                    qty: {
                                        increment: matchedQty 
                                    }
                                },
                            })
                            await tx.user.update({
                                where: {
                                    id: order.userId
                                },
                                data: {
                                    usdBalance: {
                                        decrement: (100 - Number(price)) * matchedQty
                                    }
                                }
                            })
                        }
                        await tx.position.upsert({
                            where: {
                                userId_marketId_type: {
                                    userId,
                                    marketId: data.marketId,
                                    type: "No"
                                }
                            },
                            update: {
                                qty: {
                                    increment: matchedQty 
                                }
                            },
                            create: {
                                userId,
                                marketId: data.marketId,
                                type: "No",
                                qty: matchedQty
                            }
                        })

                        await tx.user.update({
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
                        order.filledQty += matchedQty;
                        noOrderbook[price]!.availableQty -= matchedQty;
                    }
                }

                if (leftQty > 0) {
                    const oppositePrice = 100 - data.price;
                    if (!yesOrderbook[oppositePrice]) {
                        yesOrderbook[oppositePrice] = { availableQty: 0, orders: [] };
                    }
                    
                    yesOrderbook[oppositePrice]!.availableQty += leftQty;
                    yesOrderbook[oppositePrice]!.orders.push({qty: leftQty, userId, filledQty: 0, originalOrderId, reverseOrder: true});   
                }
            }

            if (data.side == "no" && data.type == "sell") {
                const buyPrice = 100 - data.price;

                const userPosition = await tx.position.findFirst({
                    where: {
                        userId: userId,
                        marketId: data.marketId,
                        type: "No"
                    }
                });

                if (!userPosition || userPosition.qty < data.qty) {
                    throw new Error("Insufficient No position");
                }

                let leftQty = data.qty;

                const prices = Object.keys(yesOrderbook).sort((a: string, b: string) => Number(a) - Number(b));

                for (const price of prices) {
                    if (Number(price) > buyPrice) {
                        continue;
                    }
                    const { orders } = yesOrderbook[price]!;
                    
                    for (const order of orders) {
                        if (leftQty <= 0) break;
                        
                        const matchedQty = order.qty >= leftQty ? leftQty : order.qty;
                        const reverseOrder = order.reverseOrder;
                        if (!reverseOrder) {
                            await tx.position.update({
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
                                },
                            })
                            await tx.user.update({
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
                            await tx.position.update({
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
                                },
                            })
                            await tx.user.update({
                                where: {
                                    id: order.userId
                                },
                                data: {
                                    usdBalance: {
                                        decrement: (100 - Number(price)) * matchedQty
                                    }
                                }
                            })
                        }
                        await tx.position.update({
                            where: {
                                userId_marketId_type: {
                                    userId,
                                    marketId: data.marketId,
                                    type: "No"
                                }
                            },
                            data: {
                                qty: {
                                    decrement: matchedQty 
                                }
                            },
                        })

                        await tx.user.update({
                            where: {
                                id: userId
                            },
                            data: {
                                usdBalance: {
                                    increment: Number(price) * matchedQty
                                }
                            }
                        })
                        
                        leftQty -= matchedQty;
                        order.filledQty += matchedQty;
                        yesOrderbook[price]!.availableQty -= matchedQty;
                    }
                }

                if (leftQty > 0) {
                    if (!noOrderbook[data.price]) {
                        noOrderbook[data.price] = { availableQty: 0, orders: [] };
                    }
                    
                    noOrderbook[data.price]!.availableQty += leftQty;
                    noOrderbook[data.price]!.orders.push({qty: leftQty, userId, filledQty: 0, originalOrderId, reverseOrder: false});   
                }
            }

            await tx.orderHistory.create({
                data: {
                    id: originalOrderId,
                    orderType: data.type === "buy" ? "Buy" : "Sell",
                    userId,
                    price: data.price,
                    qty: data.qty,
                    marketId: data.marketId
                }
            })
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
            message: "Order executed successfully"
        })
    } catch (error: any) {
        console.error("Error executing order:", error);
        if (error.message === "Insufficient USD balance") {
            res.status(403).json({
                message: "Sorry you dont have enough $ in your account"
            })
        } else if (error.message === "Insufficient Yes position" || error.message === "Insufficient No position") {
            res.status(403).json({
                message: "Sorry you dont have enough position"
            })
        } else {
            res.status(500).json({
                message: "Error executing order"
            })
        }
    }
})

app.get("/market", async (req, res) => {
    const market = await prisma.market.findFirst({
        where: {
            id: req.query.marketId as string
        }
    });

    res.json({
        market
    })
})

app.post("/sell", middleware, (req, res) => {

})

app.post("/split", middleware, async (req, res) => {
    const {data, success} = SplitSchema.safeParse(req.body);
    const userId: string = req.userId;
    if (!success) {
        res.status(411).json({message: "Incorrect inputs"});
        return 
    }
    const marketId = data?.marketId;

    await prisma.$transaction(async tx => {
        const userResponse = await tx.$queryRaw<{id: string, address: string, usdBalance: number}[]>`SELECT * FROM "User" WHERE id=${userId} FOR UPDATE;`;
        const user = userResponse[0];
        if (!user) {
            throw new Error("User not found");
        }
        
        if (user.usdBalance < data.amount) {
            res.status(403).json({
                message: "sorry you are not allowed to do this"
            })
            return
        }

        await tx.user.update({
            where: {
                id: userId
            },
            data: {
                usdBalance: {
                    decrement: data.amount
                }
            }
        })

        await tx.position.upsert({
            where: {
                userId_marketId_type: {
                    marketId,
                    userId,
                    type: "Yes"
                }
            },
            create: {
                marketId,
                userId,
                type: "Yes",
                qty: data.amount
            },
            update: {
                qty: {
                    increment: data.amount
                }
            }
            
        })

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
})

app.post("/merge", middleware, async (req, res) => {
    const {data, success} = SplitSchema.safeParse(req.body);
    const userId: string = req.userId;
    if (!success) {
        res.status(411).json({message: "Incorrect inputs"});
        return 
    }
    const marketId = data?.marketId;

    try {
        await prisma.$transaction(async tx => {
            const userResponse = await tx.$queryRaw<{id: string, address: string, usdBalance: number}[]>`SELECT * FROM "User" WHERE id=${userId} FOR UPDATE;`;
            const user = userResponse[0];
            if (!user) {
                throw new Error("User not found");
            }
            
            const yesPosition = await tx.position.findFirst({
                where: {
                    userId,
                    marketId,
                    type: "Yes"
                }
            });

            const noPosition = await tx.position.findFirst({
                where: {
                    userId,
                    marketId,
                    type: "No"
                }
            });

            if (!yesPosition || yesPosition.qty < data.amount) {
                throw new Error("Insufficient Yes position");
            }

            if (!noPosition || noPosition.qty < data.amount) {
                throw new Error("Insufficient No position");
            }

            await tx.position.update({
                where: {
                    userId_marketId_type: {
                        userId,
                        marketId,
                        type: "Yes"
                    }
                },
                data: {
                    qty: {
                        decrement: data.amount
                    }
                }
            })

            await tx.position.update({
                where: {
                    userId_marketId_type: {
                        userId,
                        marketId,
                        type: "No"
                    }
                },
                data: {
                    qty: {
                        decrement: data.amount
                    }
                }
            })

            await tx.user.update({
                where: {
                    id: userId
                },
                data: {
                    usdBalance: {
                        increment: data.amount
                    }
                }
            })

            await tx.orderHistory.create({
                data: {
                    orderType: "Merge",
                    userId,
                    price: 0,
                    qty: data.amount,
                    marketId: data.marketId
                }
            })
        })
        res.json({
            message: "Merge successful"
        })
    } catch (error: any) {
        console.error("Error merging:", error);
        if (error.message === "Insufficient Yes position" || error.message === "Insufficient No position") {
            res.status(403).json({
                message: "Sorry you dont have enough position"
            })
        } else {
            res.status(500).json({
                message: "Error merging"
            })
        }
    }
})

app.get("/balance", middleware, async (req, res) => {
    const userId: string = req.userId as string;
    const user = await prisma.user.findFirst({
        where: {
            id: userId
        }
    })

    res.json({
        balance: user?.usdBalance
    })
})

app.get("/positions", middleware, async (req, res) => {
    const userId: string = req.userId as string;
    const positions = await prisma.position.findMany({
        where: {
            userId
        }
    })

    res.json({
        positions
    })
})

app.post("/history", middleware, async (req, res) => {
    const userId: string = req.userId as string;
    const history = await prisma.orderHistory.findMany({
        where: {
            userId
        }
    })

    res.json({
        history
    })
})

app.post("/onramp", middleware, async (req, res) => {
    const { success, data } = OnrampSchema.safeParse(req.body);
    const userId: string = req.userId;

    if (!success) {
        res.status(411).json({
            message: "Incorrect inputs"
        })
        return;
    }

    try {
        await prisma.$transaction(async tx => {
            const userResponse = await tx.$queryRaw<{id: string, address: string, usdBalance: number}[]>`SELECT * FROM "User" WHERE id=${userId} FOR UPDATE;`;
            const user = userResponse[0];
            if (!user) {
                throw new Error("User not found");
            }

            // Convert USD amount to cents (integer) for storage
            const amountInCents = Math.round(data.amount * 100);

            await tx.user.update({
                where: {
                    id: userId
                },
                data: {
                    usdBalance: {
                        increment: amountInCents
                    }
                }
            });

        });

        res.json({
            message: "Onramp successful",
            amount: data.amount
        });
    } catch (error: any) {
        console.error("Error processing onramp:", error);
        res.status(500).json({
            message: "Error processing onramp"
        });
    }
});

app.post("/offramp", middleware, async (req, res) => {
    const { success, data } = OfframpSchema.safeParse(req.body);
    const userId: string = req.userId;

    if (!success) {
        res.status(411).json({
            message: "Incorrect inputs"
        })
        return;
    }

    try {
        await prisma.$transaction(async tx => {
            const userResponse = await tx.$queryRaw<{id: string, address: string, usdBalance: number}[]>`SELECT * FROM "User" WHERE id=${userId} FOR UPDATE;`;
            const user = userResponse[0];
            if (!user) {
                throw new Error("User not found");
            }

            // Convert USD amount to cents (integer) for storage
            const amountInCents = Math.round(data.amount * 100);

            if (user.usdBalance < amountInCents) {
                throw new Error("Insufficient USD balance");
            }

            await tx.user.update({
                where: {
                    id: userId
                },
                data: {
                    usdBalance: {
                        decrement: amountInCents
                    }
                }
            });

        });

        res.json({
            message: "Offramp successful",
            amount: data.amount
        });
    } catch (error: any) {
        console.error("Error processing offramp:", error);
        if (error.message === "Insufficient USD balance") {
            res.status(403).json({
                message: "Insufficient USD balance for offramp"
            });
        } else {
            res.status(500).json({
                message: "Error processing offramp"
            });
        }
    }
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