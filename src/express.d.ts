declare global {
  namespace Express {
    interface Request {
      authUser?: import("./types").User;
      compatApiKey?: import("./services/compatApiKeyService").CompatApiKeyAuthContext;
    }
  }
}

export {};
