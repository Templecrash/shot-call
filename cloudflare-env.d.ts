declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
    OPENAI_IMAGE_MODEL?: string;
    COINGECKO_API_KEY?: string;
    BUCKET?: R2Bucket;
  }
}
