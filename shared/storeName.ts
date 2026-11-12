/** Store ids are the first label of [store].rates.<domain>; the same name a store has in the Catalogue. */
export const RESERVED = new Set(['www', 'api', 'app', 'admin', 'console', 'auth', 'login', 'static', 'assets', 'media', 'cdn', 'status', 'docs', 'help', 'support', 'rates', 'ingest', 'feed', 'test', 'dev', 'demo-x']);
const NAME = /^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/;
export const isValidStoreName = (s: string) => NAME.test(s) && !RESERVED.has(s);
