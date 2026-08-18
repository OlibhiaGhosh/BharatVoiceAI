const VECTOR_SIZE = 48;

export function embedText(text: string) {
  const output = new Array<number>(VECTOR_SIZE).fill(0);
  const normalized = text.toLowerCase();
  for (let index = 0; index < normalized.length; index += 1) {
    const code = normalized.charCodeAt(index);
    output[index % VECTOR_SIZE] += code / 255;
  }
  return output.map((value) => Number((value / Math.max(normalized.length, 1)).toFixed(6)));
}
