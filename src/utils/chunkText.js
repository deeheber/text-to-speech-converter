const originalText = `I hear that serverless has servers.
    According to someone super smart...

  this
  is
    true! Don't ya know?`;

// will make this 2500 when doing this for real
const chunkLength = 10;
const textBlocks = [];
let start = 0;
let end = chunkLength;

while (start < originalText.length) {
  let nextChar = originalText[end];

  // We've reached the end or we are at the end of a word
  // i.e. the next char is not a letter, number, -, or '
  if (nextChar === undefined || nextChar.match(/[^\w'-]/)) {
    const block = originalText.substring(start, end);
    textBlocks.push(block);
    start = end;
    end += chunkLength;
  } else {
    // We're in the middle of a word, so work forward to find the new end
    // that isn't a letter, number, -, or '
    // will cause the chunk to be a tad longere than the intended chunkLength
    let newEnd = end - 1;
    let newNextChar = originalText[newEnd];

    while (newNextChar.match(/[\w'-]/)) {
      newEnd++;
      newNextChar = originalText[newEnd];
    }

    const block = originalText.substring(start, newEnd);
    textBlocks.push(block);
    start = newEnd;
    end = newEnd + chunkLength;
  }
}

console.log('Final textBlocks value: ', textBlocks);
