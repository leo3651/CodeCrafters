const args = process.argv;
const pattern = args[3];

let alternationBracketsOpened = false;
let patternAlternationStartingIndex: number;
let inputLineAlternationStartingIndex: number;
const startingBackreferencesIndexes: number[] = [];
const endingBackreferencesIndexes: number[] = [];
let numberOfNestedBrackets: number = 0;
let nestedBracketsOpened: boolean = false;
let nestedBracketsPlaceholder: number = 0;

const inputLine: string = await Bun.stdin.text();
console.log(`Input Line: ${inputLine}`);
console.log(`Pattern: ${pattern}, len: ${pattern.length}`);
console.log("\n");

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
  if (!inputLine) {
    return false;
  }

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

function combiningCharClasses(inputLine: string, pattern: string): boolean {
  for (let i = 0; i < inputLine.length; i++) {
    for (
      let patternIndex = 0, inputLineIndex = 0;
      patternIndex < pattern.length;
      patternIndex++, inputLineIndex++
    ) {
      // Start of string anchor
      if (pattern[patternIndex] === "^") {
        if (i + inputLineIndex !== 0) {
          break;
        }
        inputLineIndex--;
      }

      // End of string anchor
      else if (pattern[patternIndex] === "$") {
        if (i + inputLineIndex - 1 !== inputLine.length - 1) {
          break;
        }
      }

      // Reached the correct alternation
      else if (pattern[patternIndex] === "|") {
        while (pattern[patternIndex] !== ")") {
          patternIndex++;
        }

        patternIndex--;
        inputLineIndex--;
      }

      // Opening brackets
      else if (pattern[patternIndex] === "(") {
        if (
          nestedBrackets(pattern.slice(patternIndex)) &&
          !nestedBracketsOpened
        ) {
          nestedBracketsPlaceholder = startingBackreferencesIndexes.length;
          endingBackreferencesIndexes[nestedBracketsPlaceholder] = 999;
          nestedBracketsOpened = true;
          writeNestedBracketsNumber(pattern.slice(patternIndex));
        }

        if (alternationBrackets(pattern, patternIndex)) {
          alternationBracketsOpened = true;
          patternAlternationStartingIndex = patternIndex + 1;
          inputLineAlternationStartingIndex = i + inputLineIndex - 1;
        }

        startingBackreferencesIndexes.push(inputLineIndex + i);
        inputLineIndex--;
      }

      // Char groups opening brackets
      else if (pattern[patternIndex] === "[") {
        let negCharGroup = false;
        if (pattern[patternIndex + 1] === "^") {
          negCharGroup = true;
          patternIndex++;
        }

        const charGroupStartIndex = patternIndex + 1;
        const inputLineCharGroupStartIndex = inputLineIndex + i;

        while (pattern[patternIndex] !== "]") {
          patternIndex++;
        }

        while (
          inputLine[i + inputLineIndex] !== " " &&
          inputLine[i + inputLineIndex] !== "-" &&
          inputLine[i + inputLineIndex] !== "," &&
          i + inputLineIndex !== inputLine.length
        ) {
          inputLineIndex++;
        }

        const charGroup = pattern.slice(charGroupStartIndex, patternIndex);
        const inputLineCharGroup = inputLine.slice(
          inputLineCharGroupStartIndex,
          i + inputLineIndex
        );

        if (negCharGroup) {
          if (
            charGroup
              .split("")
              .some((char) => inputLineCharGroup.includes(char))
          ) {
            break;
          }
        } else {
          if (
            charGroup
              .split("")
              .every((char) => !inputLineCharGroup.includes(char))
          ) {
            break;
          }
        }

        patternIndex--;
        inputLineIndex--;
      }

      // Char group closing brackets
      else if (pattern[patternIndex] === "]") {
        if (pattern[patternIndex + 1] === "+") {
          patternIndex++;
        }

        inputLineIndex--;
      }

      // Closing brackets
      else if (pattern[patternIndex] === ")") {
        alternationBracketsOpened = false;

        if (nestedBracketsOpened) {
          numberOfNestedBrackets--;
        }

        if (nestedBracketsOpened && numberOfNestedBrackets === 0) {
          nestedBracketsOpened = false;
          endingBackreferencesIndexes[nestedBracketsPlaceholder] =
            inputLineIndex + i;
        } else {
          endingBackreferencesIndexes.push(inputLineIndex + i);
        }

        inputLineIndex--;
      }

      // Backslash \\
      else if (pattern[patternIndex] === "\\") {
        patternIndex++;

        // \d || \w || \w+ || \d+

        if (
          pattern[patternIndex] === "d" &&
          pattern[patternIndex + 1] === "+"
        ) {
          while (matchAnyDigit(inputLine[inputLineIndex])) {
            inputLineIndex++;
          }
          inputLineIndex--;
          patternIndex++;
        } else if (
          pattern[patternIndex] === "w" &&
          pattern[patternIndex + 1] === "+"
        ) {
          while (matchAlphanumericChars(inputLine[inputLineIndex])) {
            inputLineIndex++;
          }
          inputLineIndex--;
          patternIndex++;
        } else if (
          pattern[patternIndex] === "d" &&
          !matchAnyDigit(inputLine[i + inputLineIndex])
        ) {
          break;
        } else if (
          pattern[patternIndex] === "w" &&
          !matchAlphanumericChars(inputLine[i + inputLineIndex])
        ) {
          break;
        } else if (matchAnyDigit(pattern[patternIndex])) {
          const backreferenceNumber = Number.parseInt(pattern[patternIndex]);
          const backreferenceString = inputLine.slice(
            startingBackreferencesIndexes[backreferenceNumber - 1],
            endingBackreferencesIndexes[backreferenceNumber - 1]
          );

          if (
            !validBackreference(
              backreferenceString,
              inputLine.slice(inputLineIndex + i)
            )
          ) {
            break;
          }
          inputLineIndex += backreferenceString.length - 1;
        }
      }

      // Match one or more times
      else if (
        pattern[patternIndex + 1] === "+" &&
        (inputLine[i + inputLineIndex] === pattern[patternIndex] ||
          pattern[patternIndex] === ".")
      ) {
        let breakLoop = false;

        while (inputLine[i + inputLineIndex] !== pattern[patternIndex + 2]) {
          inputLineIndex++;
          if (inputLineIndex > inputLine.length - 1) {
            breakLoop = true;
            break;
          }
        }

        if (breakLoop) {
          break;
        }

        patternIndex++;
        inputLineIndex--;
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
          inputLineIndex = inputLineAlternationStartingIndex;
          patternIndex = patternAlternationStartingIndex - 2;
          startingBackreferencesIndexes.pop();
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

function validBackreference(
  backreferenceString: string,
  inputLine: string
): boolean {
  for (let i = 0; i < backreferenceString.length; i++) {
    if (inputLine[i] !== backreferenceString[i]) {
      return false;
    }
  }
  return true;
}

function writeNestedBracketsNumber(pattern: string): void {
  let i = 0;
  let openingBrackets = 0;
  let closingBrackets = 0;

  while (true) {
    if (pattern[i] === ")") {
      closingBrackets++;
    }
    if (pattern[i] === "(") {
      openingBrackets++;
      numberOfNestedBrackets++;
    }
    if (pattern[i] === ")" && openingBrackets - closingBrackets === 0) {
      break;
    }
    i++;
  }
}

function nestedBrackets(pattern: string): boolean {
  let i = 1;
  let nestedBrackets = false;
  while (pattern[i] !== ")") {
    if (pattern[i] === "(") {
      nestedBrackets = true;
    }
    i++;
  }

  return nestedBrackets;
}
