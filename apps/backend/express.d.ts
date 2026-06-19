declare global {
  namespace Express {
    interface Request {
      userId: string;
      walletAddress: string;
    }
  }
}

export {};
