export const MockLLM = {
    generateGrammar: function(genes) {
        console.log("Mock LLM generating grammar for:", genes);

        // 1. Base Creature Template (Standard Biped)
        // Note: Positions are relative to parent.
        // Assume unit size parts roughly 1.0 in length.

        let rules = {
            "root": [
                { symbol: "torso", pos: [0, 1.5, 0], scl: [1, 1.5, 1] }
            ],
            "torso": [
                { symbol: "head", pos: [0, 1.0, 0], scl: [0.8, 0.8, 0.8] },
                { symbol: "arm", pos: [0.6, 0.5, 0], rot: [0, 0, -30] }, // Right Arm
                { symbol: "arm", pos: [-0.6, 0.5, 0], rot: [0, 0, 30] }, // Left Arm
                { symbol: "leg", pos: [0.4, -0.8, 0] }, // Right Leg
                { symbol: "leg", pos: [-0.4, -0.8, 0] }  // Left Leg
            ],
            "arm": [
                { symbol: "forearm", pos: [0, -0.8, 0], rot: [0, 0, 0] }
            ],
            "forearm": [
                { symbol: "hand", pos: [0, -0.8, 0] }
            ],
            "leg": [
                { symbol: "calf", pos: [0, -0.8, 0] }
            ],
            "calf": [
                { symbol: "foot", pos: [0, -0.8, 0], rot: [10, 0, 0] }
            ],
            "head": [], // Terminal by default unless genes add to it
            "hand": [],
            "foot": []
        };

        // 2. Apply Gene Modifications

        // --- LONG NECK ---
        if (genes.includes("long_neck")) {
            // Remove 'head' from torso
            rules["torso"] = rules["torso"].filter(c => c.symbol !== "head");

            // Add 'neck' to torso
            rules["torso"].push({ symbol: "neck_base", pos: [0, 1.0, 0] });

            // Define neck structure
            rules["neck_base"] = [
                { symbol: "neck_segment", pos: [0, 0.5, 0], rot: [10, 0, 0] }
            ];
            rules["neck_segment"] = [
                { symbol: "neck_top", pos: [0, 0.5, 0], rot: [10, 0, 0] }
            ];
            rules["neck_top"] = [
                 { symbol: "head", pos: [0, 0.5, 0], rot: [-20, 0, 0] }
            ];
        }

        // --- WINGS ---
        if (genes.includes("wings")) {
            rules["torso"].push(
                { symbol: "wing", pos: [0.5, 0.8, -0.3], rot: [0, 30, -30], params: { type: "wing" } },
                { symbol: "wing", pos: [-0.5, 0.8, -0.3], rot: [0, -30, 30], params: { type: "wing" } }
            );

            rules["wing"] = [
                 { symbol: "wing_tip", pos: [1.5, 0, 0], scl: [0.8, 0.8, 0.8] }
            ];
            rules["wing_tip"] = [];
        }

        // --- MULTI LEGS (Centaur-ish or Spider-ish) ---
        if (genes.includes("multi_legs")) {
            // Extend torso to be longer horizontally? Or just add more legs?
            // Let's add a "lower_body" extension

            // Modify torso to attach to a lower body instead of legs directly?
            // Or just add more legs to torso. Let's add more legs.
            rules["torso"].push(
                { symbol: "leg", pos: [0.4, -0.8, 0.5], rot: [-20, 0, 0] },
                { symbol: "leg", pos: [-0.4, -0.8, 0.5], rot: [-20, 0, 0] },
                { symbol: "leg", pos: [0.4, -0.8, -0.5], rot: [20, 0, 0] },
                { symbol: "leg", pos: [-0.4, -0.8, -0.5], rot: [20, 0, 0] }
            );
        }

        // --- LASER EYES ---
        if (genes.includes("laser_eyes")) {
            // Find where head is defined. Usually it's a terminal symbol, so we add children to it.
            if (!rules["head"]) rules["head"] = [];

            rules["head"].push(
                { symbol: "eye_laser", pos: [0.2, 0.1, 0.4], scl: [0.2, 0.2, 0.5] },
                { symbol: "eye_laser", pos: [-0.2, 0.1, 0.4], scl: [0.2, 0.2, 0.5] }
            );

            rules["eye_laser"] = []; // Terminal, renderer will handle specific look
        }

        // --- SPIKES ---
        if (genes.includes("spikes")) {
            // Add spikes to the back of the torso
            rules["torso"].push(
                { symbol: "spike", pos: [0, 1.2, -0.6], rot: [-45, 0, 0] },
                { symbol: "spike", pos: [0, 0.6, -0.6], rot: [-45, 0, 0] },
                { symbol: "spike", pos: [0, 0.0, -0.6], rot: [-45, 0, 0] }
            );

            rules["spike"] = [];
        }

         // --- BIG HEAD ---
         if (genes.includes("big_head")) {
            // We need to find the rule that spawns 'head' and increase scale.
            // This is tricky if we don't know exactly where 'head' is attached (torso or neck).
            // But we can just search all values.

            for (let key in rules) {
                rules[key].forEach(child => {
                    if (child.symbol === "head") {
                        child.scl = [2.0, 2.0, 2.0];
                    }
                });
            }
        }

        return rules;
    }
};
