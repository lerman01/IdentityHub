declare global {
  namespace Express {
    interface Request {
      /** Set by requireApiKey after successful public-API authentication. */
      apiKeyAuth?: { userId: string; keyId: string };
    }
  }
}

export {};
