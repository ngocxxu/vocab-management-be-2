import { buildEmbeddingText } from './build-embedding-text.util';

describe('buildEmbeddingText', () => {
    test('joins textSource and textTargets with a separator', () => {
        // Arrange
        const textSource = 'con mèo';
        const textTargets = ['cat', 'kitty'];

        // Act
        const result = buildEmbeddingText(textSource, textTargets);

        // Assert
        expect(result).toBe('con mèo | cat | kitty');
    });

    test('drops empty and whitespace-only targets', () => {
        // Arrange
        const textSource = 'xin chào';
        const textTargets = ['hello', '  ', ''];

        // Act
        const result = buildEmbeddingText(textSource, textTargets);

        // Assert
        expect(result).toBe('xin chào | hello');
    });

    test('returns only textSource when there are no textTargets', () => {
        // Arrange & Act
        const result = buildEmbeddingText('con chó', []);

        // Assert
        expect(result).toBe('con chó');
    });

    test('trims surrounding whitespace from each part', () => {
        // Arrange & Act
        const result = buildEmbeddingText('  con cá  ', ['  fish  ']);

        // Assert
        expect(result).toBe('con cá | fish');
    });
});
