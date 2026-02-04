export class GrammarSystem {
    constructor() {
        this.rules = {};
        this.maxDepth = 10;
    }

    setRules(rules) {
        // rules is an object where key is symbol name, value is array of successor instructions
        this.rules = rules;
    }

    expand(axiom) {
        console.log("Expanding axiom:", axiom);
        return this._expandRecursive(axiom, 0);
    }

    _expandRecursive(symbol, depth) {
        // Create the node for this symbol
        const node = {
            symbol: symbol,
            children: []
        };

        if (depth >= this.maxDepth) {
            // console.warn("Max depth reached for symbol:", symbol);
            return node;
        }

        const rule = this.rules[symbol];

        if (rule) {
            // Rule format: Array of objects { symbol: "name", ...transforms }
            rule.forEach(instruction => {
                const childNode = this._expandRecursive(instruction.symbol, depth + 1);

                // Store transform data on the child node relative to this parent
                childNode.transform = {
                    pos: instruction.pos || [0, 0, 0],
                    rot: instruction.rot || [0, 0, 0], // Euler angles in degrees
                    scl: instruction.scl || [1, 1, 1]
                };

                // Store extra data (like specific geometry parameters if passed)
                if (instruction.params) {
                    childNode.params = instruction.params;
                }

                node.children.push(childNode);
            });
        }

        return node;
    }
}
