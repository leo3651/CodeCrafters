const args = process.argv;
const pattern = args[3];

let alternationBracketsOpened = false;
let patternAlternationStartingIndex: number;

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

  // Start of string anchor
  else if (pattern.startsWith("^")) {
    return startOfStringAnchor(inputLine, pattern);
  }

  // End of string anchor
  else if (pattern.endsWith("$")) {
    return endOfStringAnchor(inputLine, pattern);
  }

  // Combining character classes
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

function matchAlphanumericChars(inputLine: string): boolean {
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

function startOfStringAnchor(inputLine: string, pattern: string): boolean {
  if (inputLine.indexOf(pattern.slice(1)) !== 0) {
    return false;
  }
  return true;
}

function endOfStringAnchor(inputLine: string, pattern: string): boolean {
  const inputLineWords = inputLine.split(" ");
  const patternWords = pattern.slice(0, -1).split(" ");

  if (
    patternWords[patternWords.length - 1] !==
    inputLineWords[inputLineWords.length - 1]
  ) {
    return false;
  }
  return true;
}

function combiningCharClasses(inputLine: string, pattern: string): boolean {
  for (let i = 0; i < inputLine.length; i++) {
    for (
      let patternIndex = 0, inputLineIndex = 0;
      patternIndex < pattern.length;
      patternIndex++, inputLineIndex++
    ) {
      // Reached the correct alternation
      if (pattern[patternIndex] === "|") {
        while (pattern[patternIndex] !== ")") {
          patternIndex++;
        }
      }

      // Opening brackets
      if (pattern[patternIndex] === "(") {
        if (alternationBrackets(pattern, patternIndex)) {
          alternationBracketsOpened = true;
          patternAlternationStartingIndex = patternIndex + 1;
        }
        patternIndex++;
      }

      // Closing brackets
      if (pattern[patternIndex] === ")") {
        alternationBracketsOpened = false;
        patternIndex++;
      }

      // Backslash \\
      if (pattern[patternIndex] === "\\") {
        patternIndex++;

        // \d || \w
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
      }

      // Match one or more times
      else if (
        pattern[patternIndex + 1] === "+" &&
        (inputLine[i + inputLineIndex] === pattern[patternIndex] ||
          pattern[patternIndex] === ".")
      ) {
        let breakLoop = false;
        const originalIndex = i;

        while (inputLine[i + inputLineIndex] !== pattern[patternIndex + 2]) {
          i++;
          if (i > inputLine.length - 1) {
            breakLoop = true;
            break;
          }
        }

        if (breakLoop) {
          i = originalIndex;
          break;
        }

        patternIndex++;
        i--;
      }

      // Match zero or one time
      else if (pattern[patternIndex + 1] === "?") {
        if (pattern[patternIndex] === inputLine[i + inputLineIndex]) {
          patternIndex++;
        } else if (
          pattern[patternIndex + 2] === inputLine[i + inputLineIndex]
        ) {
          patternIndex += 2;
        } else {
          break;
        }
      }

      // Compare chars (break if not equal)
      else if (
        inputLine[i + inputLineIndex] !== pattern[patternIndex] &&
        pattern[patternIndex] !== "."
      ) {
        if (!alternationBracketsOpened) {
          break;
        } else {
          i--;
          pattern =
            pattern.slice(0, patternAlternationStartingIndex) +
            pattern.slice(pattern.indexOf("|") + 1);
          alternationBracketsOpened = false;
        }
      }

      // Input line matches pattern
      if (patternIndex >= pattern.length - 1) {
        return true;
      }
    }
  }
  return false;
}

function alternationBrackets(pattern: string, index: number): boolean {
  while (true) {
    if (pattern[index] === ")") {
      return false;
    }
    if (pattern[index] === "|") {
      return true;
    }
    if (index > pattern.length) {
      return false;
    }
    index++;
  }
}
