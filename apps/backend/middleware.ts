import type { NextFunction, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    import.meta.env.SUPABASE_URL!,
    import.meta.env.SUPABASE_SECRET_KEY!
)

export async function middleware(req: Request, res: Response, next: NextFunction) {
    const token = req.headers.authorization;
    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        console.log(user);
        console.log(error);   
    } catch (err) {
        res.status(403).json({
            message: "Incorrect Credentials"
        })
    }
    

}