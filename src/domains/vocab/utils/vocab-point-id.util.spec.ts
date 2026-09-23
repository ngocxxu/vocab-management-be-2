import { uuidV5, toVocabPointId } from './vocab-point-id.util';

const UUID_V5_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('toVocabPointId', () => {
    test('produces a well-formed UUID v5 (version nibble 5, RFC 4122 variant)', () => {
        // Arrange
        const cuid = 'cmjpsfjj10005jhb5hdwsl2je';

        // Act
        const pointId = toVocabPointId(cuid);

        // Assert — this is exactly what Qdrant validates; a raw cuid fails it
        expect(pointId).toMatch(UUID_V5_PATTERN);
    });

    test('is deterministic — the same cuid always maps to the same point id', () => {
        // Arrange
        const cuid = 'cmjpsfjj10005jhb5hdwsl2je';

        // Act
        const first = toVocabPointId(cuid);
        const second = toVocabPointId(cuid);

        // Assert — skipping a cuid -> uuid mapping table depends on this
        expect(first).toBe(second);
    });

    test('maps different cuids to different point ids', () => {
        // Arrange & Act
        const a = toVocabPointId('cmjpsfjj10005jhb5hdwsl2je');
        const b = toVocabPointId('cmjpsfjj10006jhb5hdwsl2jf');

        // Assert
        expect(a).not.toBe(b);
    });

    test('matches the published RFC 4122 v5 test vector', () => {
        // Arrange — RFC 4122 Appendix: DNS namespace + "www.example.com"
        const dnsNamespace = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

        // Act
        const result = uuidV5('www.example.com', dnsNamespace);

        // Assert — pins the hand-rolled implementation to the standard
        expect(result).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
    });
});
