export interface ScriptedLine {
  first: string;
  second?: string;
}

export const SCRIPTED_LINES: readonly ScriptedLine[] = [
  { first: "The fire sounds extra soft tonight." },
  { first: "I saved the warm spot." },
  { first: "The rain can take its time." },
  { first: "The room is doing just fine." },
  { first: "A quiet minute feels nice." },
  { first: "The window looks painted tonight." },
  { first: "That chair has excellent manners." },
  { first: "The floorboards know this song." },
  { first: "A small pause is still company." },
  { first: "The kettle would sound good now." },
  { first: "The lamp makes a tiny sunset." },
  { first: "Nothing urgent lives in this room." },
  { first: "The rug is winning at being cozy." },
  { first: "A slow evening suits the place." },
  { first: "The cat has claimed the calm." },
  { first: "That log settled in perfectly." },
  { first: "The stars are keeping watch." },
  { first: "The shelf looks proud of itself." },
  { first: "A warm room needs no hurry." },
  { first: "The night can wait outside." },
  { first: "This corner has good quiet." },
  { first: "The fire is telling a short story." },
  { first: "The chairs make a fine little circle." },
  { first: "A soft room is a useful thing." },
  { first: "The moon found the window again." },
  { first: "The shadows are behaving tonight." },
  { first: "Warm socks would fit this weather." },
  { first: "The room just took a deep breath." },
  { first: "The quiet has a nice rhythm." },
  { first: "The embers are still awake." },
  { first: "The plants seem very settled." },
  { first: "A little stillness goes a long way." },
  { first: "The window has the best view." },
  { first: "The cat approves of this silence." },
  { first: "The room feels gently occupied." },
  { first: "The evening arrived without a fuss." },
  { first: "A chair creaked. Mystery solved." },
  { first: "The firelight found every corner." },
  { first: "The night is moving slowly." },
  { first: "The rug could use a tiny parade." },
  { first: "The air feels warm around the edges." },
  { first: "The shelf is holding up nicely." },
  { first: "Even the clock sounds relaxed." },
  { first: "The room has enough light." },
  { first: "The stars look close from here." },
  { first: "The cat scheduled another nap." },
  { first: "This silence has comfortable shoes." },
  { first: "The fire found its second wind." },
  { first: "A quiet room can still feel full." },
  { first: "The evening is in no rush." },
  { first: "Tea weather.", second: "Every weather is tea weather." },
  { first: "Did the floor creak?", second: "Only a very small hello." },
  { first: "The fire is lively.", second: "It likes having an audience." },
  { first: "That star moved.", second: "A cloud did the moving." },
  { first: "Is the cat awake?", second: "Technically, one ear is." },
  { first: "This chair is warm.", second: "The room planned ahead." },
  { first: "The rain sounds close.", second: "The roof has it handled." },
  { first: "A late evening?", second: "A comfortably late one." },
  { first: "The lamp looks sleepy.", second: "It still has one glow left." },
  { first: "Was that a tiny yawn?", second: "The whole room, probably." },
  { first: "The rug shifted.", second: "The cat has an alibi." },
  { first: "Another log?", second: "The embers voted yes." },
  { first: "The room feels still.", second: "Still can be friendly." },
  { first: "Window open?", second: "Just enough for the night air." },
  { first: "Quiet out there.", second: "Cozy in here." },
  { first: "The stars are bright.", second: "They had time to practice." },
] as const;

export class LinePicker {
  private readonly recent: number[] = [];

  constructor(
    private readonly lines: readonly ScriptedLine[] = SCRIPTED_LINES,
    private readonly random: () => number = Math.random,
    private readonly historySize = 15,
  ) {
    if (lines.length <= historySize) {
      throw new Error("The line catalog must be larger than the no-repeat history.");
    }
  }

  pick(): ScriptedLine {
    const candidates = this.lines
      .map((_line, index) => index)
      .filter((index) => !this.recent.includes(index));
    const randomIndex = Math.min(
      candidates.length - 1,
      Math.max(0, Math.floor(this.random() * candidates.length)),
    );
    const selectedIndex = candidates[randomIndex];
    if (selectedIndex === undefined) throw new Error("No scripted line is available.");

    this.recent.push(selectedIndex);
    if (this.recent.length > this.historySize) this.recent.shift();
    return this.lines[selectedIndex] as ScriptedLine;
  }
}
