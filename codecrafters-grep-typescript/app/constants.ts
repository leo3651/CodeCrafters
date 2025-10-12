export const DIGITS: string[] = [
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
];

export const ALPHA: string[] = [];

for (let i = "a".charCodeAt(0); i <= "z".charCodeAt(0); i++) {
  ALPHA.push(String.fromCharCode(i));
}
for (let i = "A".charCodeAt(0); i <= "Z".charCodeAt(0); i++) {
  ALPHA.push(String.fromCharCode(i));
}
ALPHA.push("_");
