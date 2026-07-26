declare global {
  namespace Express {
    interface Request {
      /** Set by requireApiKey after successful public-API authentication. */
      apiKeyAuth?: { accountId: string; keyId: string };
    }
  }
}

export {};
