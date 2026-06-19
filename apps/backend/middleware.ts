import type { NextFunction, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "db";

const supabase = createClient(
    import.meta.env.SUPABASE_URL!,
    import.meta.env.SUPABASE_SECRET_KEY!
)

export async function middleware(req: Request, res: Response, next: NextFunction) {
    const token = req.headers.authorization;
    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        const address = user?.user_metadata.custom_claims.address;
        const userDb = await prisma.user.upsert({
            where: {
                address,
            },
            update: {
                address,
            },
            create: {
                address,
                usdBalance: 0
            }
        })
        
        if (address) {
            req.userId = userDb.id;
            next();
        } else {
            res.status(403).json({
                message: "Incorrect Credentials"
            })
        }
    } catch (err) {
        res.status(403).json({
            message: "Incorrect Credentials"
        })
    }
}