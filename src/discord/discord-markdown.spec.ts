import { splitDiscordMarkdown } from './discord-markdown.js';

describe('splitDiscordMarkdown', () => {
  it('keeps short Markdown unchanged', () => {
    expect(splitDiscordMarkdown('**Hello**')).toEqual(['**Hello**']);
  });

  it('splits long responses within the Discord message limit', () => {
    const chunks = splitDiscordMarkdown('word '.repeat(1_000));

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 2_000)).toBe(true);
  });

  it('balances fenced code blocks across messages', () => {
    const chunks = splitDiscordMarkdown(
      `\`\`\`ts\n${'const value = 1;\n'.repeat(150)}\`\`\``,
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(
      chunks.every((chunk) => (chunk.match(/```/g)?.length ?? 0) % 2 === 0),
    ).toBe(true);
  });
});
