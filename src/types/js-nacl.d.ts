/**
 * Minimal checked interface for the js-nacl runtime operations used by ToM.
 * The upstream package ships JavaScript without TypeScript declarations.
 * Keep this contract narrow instead of declaring the entire module as `any`.
 */
declare module "js-nacl" {
  export interface Nacl {
    encode_utf8(text: string): Uint8Array;
    crypto_hash_sha256(input: Uint8Array): Uint8Array;
    crypto_hash(input: Uint8Array): Uint8Array;
  }

  const factory: {
    instantiate(callback: (instance: Nacl) => void): void;
  };
  export default factory;
}
