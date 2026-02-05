import { CONFIG } from './config.js';

export const LLM = {
    generateGrammar: async function(genes) {
        console.log("LLM generating grammar for:", genes);

        const systemPrompt = `You are a bio-engineer AI. Your task is to generate a hierarchical 3D structure for an organic creature based on a list of active genes.
The creature will be rendered using Raymarching SDFs (Signed Distance Functions), allowing for smooth blending between parts.

The output must be a valid JSON object representing the grammar rules.

Structure:
- The JSON object keys are symbols (strings).
- The values are arrays of instruction objects.
- Each instruction object describes a child part attached to the parent symbol.
- Instruction fields:
  - "symbol": (string) The name of the child part.
  - "pos": [x, y, z] (Array of 3 numbers) Position relative to parent.
  - "rot": [x, y, z] (Array of 3 numbers) Rotation in degrees. (Optional, default [0,0,0])
  - "scl": [x, y, z] (Array of 3 numbers) Scale. (Optional, default [1,1,1])
  - "params": {} (Object) Optional parameters.

Supported Symbols (Mapped to SDF Primitives):
- Core: "root", "torso" (Rounded Box), "head" (Sphere/Ellipsoid), "neck" (Capsule chain)
- Limbs: "arm", "forearm", "hand", "leg", "calf", "foot" (Capsules/Rounded Boxes)
- Extras: "wing" (Thin Rounded Box), "spike" (Cone/Pyramid), "eye_laser" (Cylinder)

Requirements:
1. The "root" symbol must be defined and typically contains the "torso".
2. Create a complete hierarchical structure (e.g., torso -> arm -> forearm -> hand).
3. **Organic Flow:** Use overlapping shapes and positions that flow naturally into each other. The renderer will automatically blend them. Avoid gaps between joints.
4. Incorporate the requested GENES into the design.
5. If "multi_legs" is present, add more legs.
6. If "long_neck" is present, use multiple "neck" segments.
7. Return ONLY the JSON object. Do not wrap it in markdown code blocks.
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
