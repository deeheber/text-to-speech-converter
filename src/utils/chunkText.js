const originalText = "Hello, here's some text. How are you doing today?";

// will make this 1000 when doing this for real
const chunkLength = 5;
const textBlocks = [];
let start = 0;
let end = chunkLength;

while (start < originalText.length) {
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
