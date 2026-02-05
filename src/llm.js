import { CONFIG } from './config.js';

export const LLM = {
    generateGrammar: async function(genes) {
        console.log("LLM generating grammar for:", genes);

        const systemPrompt = `You are a bio-engineer AI. Your task is to generate a hierarchical 3D structure for an organic creature based on a list of active genes.
The creature will be rendered using Raymarching SDFs (Signed Distance Functions), allowing for smooth blending between parts, like metaballs.

You are not just assembling rigid parts; you are SCULPTING organic matter. You have full control over the shape, size, color, and blending of each part.

The output must be a valid JSON object representing the grammar rules.

Structure:
- The JSON object keys are symbols (strings) (e.g., "torso", "arm_segment", "eye").
- The values are arrays of instruction objects.
- Each instruction object describes a child part attached to the parent symbol.
- Instruction fields:
  - "symbol": (string) The name of the child part.
  - "pos": [x, y, z] (Array of 3 numbers) Position relative to parent.
  - "rot": [x, y, z] (Array of 3 numbers) Rotation in degrees. (Optional, default [0,0,0])
  - "scl": [x, y, z] (Array of 3 numbers) Scale. (Optional, default [1,1,1])
  - "params": {} (Object) Visual parameters for this part.

"params" Object Fields (Crucial for the Look):
  - "shape": (string) "sphere", "box", "capsule", "cylinder".
  - "size": [x, y, z] (Array of 3 numbers) The dimensions of the shape.
    - sphere: [radius, 0, 0] (Use x for radius)
    - box: [half_width, half_height, half_depth]
    - capsule: [radius, height, 0] (x is radius, y is height)
    - cylinder: [radius, height, 0] (x is radius, y is height)
  - "color": [r, g, b] (Array of 3 floats, 0.0 - 1.0).
  - "blend": (float, 0.0 - 1.0) How much this shape blends with its parent and neighbors.
    - 0.0 = Rigid connection (sharp seams).
    - 0.3 - 0.5 = Organic muscle/skin blending.
    - 0.8+ = Very blobby/liquid.

Design Guidelines:
1. **Metaball Creature:** Use "sphere" and "capsule" with high "blend" values (0.3 - 0.6) to create fleshy, organic forms that flow into each other.
2. **Hierarchy:** The "root" usually contains the "torso". Build limbs (arms, legs) as chains of segments.
3. **Hard Parts:** Use "box" or "cylinder" with low "blend" (0.0 - 0.1) for beaks, claws, horns, or armor plates.
4. **Genes:** Incorporate the requested GENES.
   - "multi_legs": Add more leg chains.
   - "long_neck": Add a chain of neck segments.
   - "spikes": Add sharp, low-blend cones (capsules with variable size or just small capsules) or boxes.
5. Return ONLY the JSON object. Do not wrap it in markdown code blocks.
`;

        const userPrompt = `Genes: ${JSON.stringify(genes)}`;

        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${CONFIG.OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": window.location.href, // Optional
                    "X-Title": "BioGraph" // Optional
                },
                body: JSON.stringify({
                    "model": "z-ai/glm-4.7-flash",
                    "messages": [
                        { "role": "system", "content": systemPrompt },
                        { "role": "user", "content": userPrompt }
                    ],
                    "temperature": 0.7
                })
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const content = data.choices[0].message.content;

            // Simple cleanup to handle potential markdown code blocks
            let jsonString = content.trim();
            if (jsonString.startsWith("```json")) {
                jsonString = jsonString.slice(7);
            }
            if (jsonString.startsWith("```")) {
                jsonString = jsonString.slice(3);
            }
            if (jsonString.endsWith("```")) {
                jsonString = jsonString.slice(0, -3);
            }

            const rules = JSON.parse(jsonString);
            return rules;

        } catch (error) {
            console.error("LLM Generation Failed:", error);
            // Fallback or re-throw
            // For now, let's return a simple fallback to prevent crash
             return {
                "root": [
                    { "symbol": "torso", "pos": [0, 1.5, 0] }
                ],
                "torso": [
                    { "symbol": "head", "pos": [0, 1, 0] }
                ]
            };
        }
    }
};
