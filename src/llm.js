import { CONFIG } from './config.js';

export const LLM = {
    generateGrammar: async function(genes) {
        console.log("LLM generating grammar for:", genes);

        const schemaDefinition = `
{
  "type": "object",
  "required": ["phenotype_id", "behavior_profile", "style_parameters", "topology_graph"],
  "properties": {
    "phenotype_id": { "type": "string", "description": "Unique genotype code (e.g. MON-TITAN-X92)" },
    "behavior_profile": {
      "type": "object",
      "required": ["personality", "locomotion_style"],
      "properties": {
        "personality": { "type": "string", "enum": ["aggressive", "timid", "territorial", "curious", "docile"] },
        "locomotion_style": { "type": "string", "enum": ["bipedal", "quadrupedal", "hexapod", "arachnid", "serpentine", "hovering"] }
      }
    },
    "style_parameters": {
      "type": "object",
      "required": ["smoothness", "chaos_factor", "primary_material"],
      "properties": {
        "smoothness": { "type": "number", "description": "SDF smooth min k (0.0 to 1.0)" },
        "chaos_factor": { "type": "number", "description": "Noise factor" },
        "primary_material": { "type": "string", "enum": ["organic_flesh", "chitin_shell", "crystal", "lava_rock", "plant_matter", "mechanical"] }
      }
    },
    "topology_graph": {
      "type": "object",
      "required": ["root_node", "nodes"],
      "properties": {
        "root_node": { "type": "string", "description": "ID of the root node" },
        "nodes": {
          "type": "array",
          "maxItems": 20,
          "items": {
            "type": "object",
            "required": ["id", "semantic_role", "sdf_primitive", "scale", "color", "parent", "relative_pos", "connection_type", "symmetry_pair", "deformation"],
            "properties": {
              "id": { "type": "string" },
              "semantic_role": { "type": "string", "enum": ["core", "head", "limb_segment", "ik_end_effector", "tail", "weapon", "decoration"] },
              "sdf_primitive": { "type": "string", "enum": ["sdRoundBox", "sdCappedCylinder", "sdSphere", "sdCapsule", "sdCone"] },
              "scale": { "type": "array", "items": { "type": "number" }, "minItems": 3, "maxItems": 3, "description": "Absolute scale [x, y, z]" },
              "color": { "type": "array", "items": { "type": "number", "minimum": 0, "maximum": 1 }, "minItems": 3, "maxItems": 3, "description": "RGB color [0-1, 0-1, 0-1]" },
              "parent": { "type": ["string", "null"], "description": "Parent Node ID" },
              "relative_pos": { "type": "array", "items": { "type": "number" }, "minItems": 3, "maxItems": 3, "description": "Offset from parent [x, y, z]" },
              "connection_type": { "type": "string", "enum": ["smooth_union", "rigid_union", "ball_joint", "subtract"] },
              "symmetry_pair": { "type": ["string", "null"], "description": "ID of the mirrored node (e.g. arm_R). If null, no symmetry." },
              "deformation": { "type": "string", "enum": ["none", "taper_top", "taper_bottom", "bend_forward", "bend_backward", "twist"] }
            }
          }
        }
      }
    }
  }
}
`;

        const systemPrompt = `You are an advanced Bio-Architect AI. Your goal is to design a procedural creature based on a set of genes, adhering strictly to a specific JSON Schema which serves as a Data Contract for an external SDF Geometry Engine.

**CRITICAL INSTRUCTIONS:**
1. **Output Format**: You must output ONLY valid JSON. Do not include markdown formatting or explanations.
2. **Schema Adherence**: The output must validate against the provided JSON Schema.
3. **Data Contract**:
   - **maxItems: 20**: The 'nodes' array must NOT exceed 20 items. Use large, expressive shapes (Capsules, Boxes) to define volume efficiently. Avoid clutter.
   - **Hierarchy**: The 'parent' chain depth (distance from root) must not exceed 5.
   - **Symmetry**: Do NOT output the mirrored side in the 'nodes' array. Output ONLY the left side (or right) and set 'symmetry_pair' to the ID the mirrored node *would* have (e.g., if defining 'arm_L', set symmetry_pair to 'arm_R'). The engine handles the mirroring automatically.
   - **IK Anchors**: For legs/feet, you MUST set 'semantic_role' to 'ik_end_effector' on the node that touches the ground. This activates the procedural gait controller.
   - **Connection Types**:
     - 'smooth_union': Organic, fleshy blending.
     - 'rigid_union' / 'ball_joint': Mechanical or articulated joints (sharp seams).
     - 'subtract': Carve details (e.g. eye sockets, mouth).

**Design Guidelines**:
- Interpret the **Genes** creatively. "Predator" might imply 'aggressive' personality, 'chitin_shell' material, and 'weapon' nodes.
- **Coloring**: Assign specific RGB colors to each node based on the creature's theme and the part's function. E.g., a "lava" creature should have dark rock skin (0.1, 0.1, 0.1) and bright glowing cores (1.0, 0.3, 0.0). "Plant" creatures should vary in greens. Eyes/sensors should contrast with the body.
- Ensure the 'root_node' (usually torso/core) has 'parent': null and is at [0,0,0] (or appropriate height).
- Use 'relative_pos' to offset children from parents.
- Balance the creature. If 'quadrupedal', ensure 4 limb chains end in effectors (even if you only define 2 and use symmetry).

**JSON Schema**:
${schemaDefinition}
`;

        const userPrompt = `Genes: ${JSON.stringify(genes)}`;

        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${CONFIG.OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": window.location.href,
                    "X-Title": "BioGraph"
                },
                body: JSON.stringify({
                    "model": "z-ai/glm-4.7-flash",
                    "messages": [
                        { "role": "system", "content": systemPrompt },
                        { "role": "user", "content": userPrompt }
                    ],
                    "temperature": 0.7,
                    "response_format": { "type": "json_object" } // specific for some providers, harmless if ignored
                })
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const content = data.choices[0].message.content;

            console.log("LLM Raw Response Content:", content);

            // Simple cleanup
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

            const creatureData = JSON.parse(jsonString);
            return creatureData;

        } catch (error) {
            console.error("LLM Generation Failed:", error);
            // Fallback for testing/error
            // Return a minimal valid object conforming to the new schema
             return {
                "phenotype_id": "ERROR-FALLBACK",
                "behavior_profile": { "personality": "docile", "locomotion_style": "hovering" },
                "style_parameters": { "smoothness": 0.5, "chaos_factor": 0.0, "primary_material": "organic_flesh" },
                "topology_graph": {
                    "root_node": "core",
                    "nodes": [
                        {
                            "id": "core", "semantic_role": "core", "sdf_primitive": "sdSphere",
                            "scale": [1, 1, 1], "color": [0.8, 0.5, 0.4], "parent": null, "relative_pos": [0, 1, 0],
                            "connection_type": "smooth_union", "symmetry_pair": null, "deformation": "none"
                        }
                    ]
                }
            };
        }
    }
};
