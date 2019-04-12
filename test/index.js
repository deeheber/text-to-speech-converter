const originalText = 'Hello, here\'s some text. How are you doing today?';

const chunkLength = 7;
const textBlocks = [];
let start = 0;
let end = chunkLength;

while (start < chunkLength) {
  let nextChar = originalText[end];

  // We've reached the end or we are at the end of a word
  // i.e. the next char is not a letter, number, -, or '
  if (nextChar === undefined || nextChar.test(/[^\w'-]/)) {
    const block = originalText.substring(start, end);
    textBlocks.push(block);
    start = end;
    end += chunkLength;
  } else {
    // We're in the middle of a word, so work backwards to find the new end
  }
}
