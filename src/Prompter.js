// Prompter.js
// Reads lines that the user types in the console.
// It also works when input is piped in (for example: node src/CampusServiceApp.js < input.txt).
// It does NOT touch any files: it only talks to the keyboard / screen.

const readline = require("readline");

class Prompter {
  #queue = [];       // lines that arrived before anybody asked for them
  #waiting = null;   // the ask() that is waiting for the next line
  #closed = false;
  #echo;
  #output;

  constructor(input = process.stdin, output = process.stdout) {
    this.#output = output;
    this.#echo = !input.isTTY; // when input is piped, print it so the screen shows what was "typed"
    const rl = readline.createInterface({ input, terminal: false });
    rl.on("line", (line) => {
      if (this.#waiting) {
        const resolve = this.#waiting;
        this.#waiting = null;
        resolve(line);
      } else {
        this.#queue.push(line);
      }
    });
    rl.on("close", () => {
      this.#closed = true;
      if (this.#waiting) {
        const resolve = this.#waiting;
        this.#waiting = null;
        resolve(null);
      }
    });
  }

  // Shows the question and waits for one line. Returns null when the input has ended.
  async ask(question) {
    this.#output.write(question);
    let line;
    if (this.#queue.length > 0) {
      line = this.#queue.shift();
    } else if (this.#closed) {
      line = null;
    } else {
      line = await new Promise((resolve) => { this.#waiting = resolve; });
    }
    if (line !== null && this.#echo) {
      this.#output.write(`${line}\n`);
    }
    return line === null ? null : line.trim();
  }
}

module.exports = { Prompter };
