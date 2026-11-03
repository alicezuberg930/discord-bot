const RAW_CHUNK_LENGTH = 1_800;

export function splitDiscordMarkdown(markdown: string): string[] {
  const content = markdown.trim();

  if (!content) {
    return ['Gemini returned an empty response.'];
  }

  const chunks = splitRawContent(content);
  let openFence: string | null = null;

  return chunks.map((chunk) => {
    const prefix = openFence === null ? '' : `\`\`\`${openFence}\n`;

    for (const line of chunk.split('\n')) {
      const fence = line.trim().match(/^```([\w+-]*)$/);

      if (fence) {
        openFence = openFence === null ? fence[1].slice(0, 32) : null;
      }
    }

    const suffix = openFence === null ? '' : '\n```';
    return `${prefix}${chunk}${suffix}`;
  });
}

function splitRawContent(content: string): string[] {
  const chunks: string[] = [];
  let remaining = content;

  while (remaining.length > RAW_CHUNK_LENGTH) {
    let splitAt = remaining.lastIndexOf('\n', RAW_CHUNK_LENGTH);
    let delimiterLength = 1;

    if (splitAt < RAW_CHUNK_LENGTH / 2) {
      splitAt = remaining.lastIndexOf(' ', RAW_CHUNK_LENGTH);
    }

    if (splitAt < RAW_CHUNK_LENGTH / 2) {
      splitAt = RAW_CHUNK_LENGTH;
      delimiterLength = 0;
    }

    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt + delimiterLength);
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}
