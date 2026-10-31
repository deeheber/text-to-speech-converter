export const chunkText = (originalText) => {
  const chunkLength = 2500;
  const characters = Array.from(originalText);
  const textBlocks = [];
  let start = 0;

  while (start < characters.length) {
    let end = Math.min(start + chunkLength, characters.length);
    if (end < characters.length) {
      for (let boundary = end; boundary > start; boundary--) {
        if (/\s/u.test(characters[boundary - 1])) {
          end = boundary;
          break;
        }
      }
    }
    textBlocks.push(characters.slice(start, end).join(''));
    start = end;
  }

  return textBlocks;
};
