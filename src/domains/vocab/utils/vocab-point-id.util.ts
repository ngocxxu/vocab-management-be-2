import { createHash } from 'node:crypto';

/**
 * Fixed namespace for deriving Qdrant point ids from vocab cuids.
 *
 * MUST NEVER CHANGE. Every stored point id is derived from it, so a different
 * namespace silently orphans the entire collection: new writes land on new ids
 * while every existing point becomes unreachable and unprunable.
 */
const VOCAB_POINT_NAMESPACE = '731d3f79-fbfb-4e30-bf70-7b021897e712';

const UUID_BYTE_LENGTH = 16;
const VERSION_BYTE = 6;
const VARIANT_BYTE = 8;

/**
 * RFC 4122 §4.3 name-based UUID v5 (SHA-1).
 *
 * Hand-rolled rather than pulling in `uuid`: that package is ESM-only from v14,
 * which Jest cannot load under this repo's CommonJS setup. The algorithm is
 * ~10 lines and pinned by the published RFC test vector in the spec file.
 */
export function uuidV5(name: string, namespace: string): string {
    const namespaceBytes = Buffer.from(namespace.replace(/-/g, ''), 'hex');
    const hash = createHash('sha1').update(namespaceBytes).update(Buffer.from(name, 'utf8')).digest();

    const bytes = Buffer.from(hash.subarray(0, UUID_BYTE_LENGTH));
    // Bit twiddling is the specification: RFC 4122 defines the version and
    // variant as specific bits inside the hash, so there is no non-bitwise form.
    /* eslint-disable no-bitwise */
    bytes[VERSION_BYTE] = (bytes[VERSION_BYTE] & 0x0f) | 0x50; // version 5
    bytes[VARIANT_BYTE] = (bytes[VARIANT_BYTE] & 0x3f) | 0x80; // RFC 4122 variant
    /* eslint-enable no-bitwise */

    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Maps a `Vocab.id` (a cuid, e.g. `cmjpsfjj10005jhb5hdwsl2je`) to a Qdrant point id.
 *
 * Qdrant only accepts uint64 or UUID point ids. Its TypeScript type is
 * `number | string`, so passing a raw cuid compiles cleanly and then fails at
 * runtime with `400 Format error in JSON body`.
 *
 * Deterministic: the same cuid always yields the same UUID, so no cuid -> uuid
 * mapping table is needed. The reverse direction is not recoverable, which is
 * why Qdrant payloads carry `vocabId` explicitly.
 */
export function toVocabPointId(vocabId: string): string {
    return uuidV5(vocabId, VOCAB_POINT_NAMESPACE);
}
