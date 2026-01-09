export type RegexAST =
  | { type: "Sequence"; elements: RegexAST[] }
  | { type: "Alternative"; options: RegexAST[] }
  | { type: "Group"; child: RegexAST; index: number }
  | { type: "Quantifier"; quant: string; child: RegexAST }
  | { type: "Literal"; value: string }
  | { type: "Digit" } // for \d
  | { type: "Anchor"; kind: "start" | "end" }
  | { type: "Wildcard" }
  | { type: "Word" } // for \w
  | { type: "CharClass"; chars: string; negated?: boolean }
  | { type: "BackReference"; index: number };

export type Position = {
  positionStart?: number;
  positionEnd: number;
  groups: string[];
};
