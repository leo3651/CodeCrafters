const args = process.argv;
const pattern = args[3];

const inputLine: string = await Bun.stdin.text();
console.log(`Input Line: ${inputLine}`);
console.log(`Pattern: ${pattern}, len: ${pattern.length}`);

if (args[2] !== "-E") {
  console.log("Expected first argument to be '-E'");
  process.exit(1);
}

if (matchPattern(inputLine, pattern)) {
  console.log("Character is found. Exiting with 0...");
  process.exit(0);
} else {
  console.log("Character is NOT found. Exiting with 1...");
  process.exit(1);
}

function matchPattern(inputLine: string, pattern: string): boolean {
  // Match literal char
  if (pattern.length === 1) {
    return matchLiteralChar(pattern, inputLine);
  }

  // Includes any digit
  else if (pattern === "\\d") {
    return matchAnyDigit(inputLine);
  }

  // Match alphanumeric characters
  else if (pattern === "\\w") {
    return matchAlphanumericChars(inputLine);
  }

  // Match negative characters group
  else if (pattern.startsWith("[^") && pattern.endsWith("]")) {
    const charsArr = pattern.slice(2, -1).split("");
    return charsArr.every((char) => !inputLine.includes(char));
  }

  // Match positive characters group
  else if (pattern.startsWith("[") && pattern.endsWith("]")) {
    const charsArr = pattern.slice(1, -1).split("");
    return charsArr.some((char) => inputLine.includes(char));
  }

  // Unhandled pattern
  else {
    return combiningCharClasses(inputLine, pattern);
  }
}

function matchLiteralChar(char: string, inputLine: string): boolean {
  return inputLine.includes(char);
}

function matchAnyDigit(inputLine: string): boolean {
  for (let i = 0; i < inputLine.length; i++) {
    if (inputLine[i].charCodeAt(0) >= 48 && inputLine[i].charCodeAt(0) <= 57) {
      return true;
    }
  }
  return false;
}

function matchAlphanumericChars(inputLine: string) {
  for (let i = 0; i < inputLine.length; i++) {
    if (
      (inputLine[i].charCodeAt(0) >= 48 && inputLine[i].charCodeAt(0) <= 57) ||
      (inputLine[i].charCodeAt(0) >= 65 && inputLine[i].charCodeAt(0) <= 90) ||
      (inputLine[i].charCodeAt(0) >= 97 && inputLine[i].charCodeAt(0) <= 122) ||
      inputLine[i].charCodeAt(0) === 95
    ) {
      return true;
    }
  }
  return false;
}

function combiningCharClasses(inputLine: string, pattern: string) {
  for (let i = 0; i < inputLine.length; i++) {
    for (
      let patternIndex = 0, inputLineIndex = 0;
      patternIndex < pattern.length;
      patternIndex++, inputLineIndex++
    ) {
      if (pattern[patternIndex] === "\\") {
        patternIndex++;

        if (
          pattern[patternIndex] === "d" &&
          !matchAnyDigit(inputLine[i + inputLineIndex])
        ) {
          break;
        } else if (
          pattern[patternIndex] === "w" &&
          !matchAlphanumericChars(inputLine[i + inputLineIndex])
        ) {
          break;
        }
      } else if (inputLine[i + inputLineIndex] !== pattern[patternIndex]) {
        break;
      }

      if (patternIndex === pattern.length - 1) {
        return true;
      }
    }
  }

  return false;
}
