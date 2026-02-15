export const TEST_CREATURE = {
  "phenotype_id": "TEST-CREATURE-V1",
  "behavior_profile": {
    "personality": "aggressive",
    "locomotion_style": "bipedal"
  },
  "style_parameters": {
    "smoothness": 0.3,
    "chaos_factor": 0.1,
    "primary_material": "organic_flesh"
  },
  "topology_graph": {
    "root_node": "torso_core",
    "nodes": [
      {
        "id": "torso_core",
        "semantic_role": "core",
        "sdf_primitive": "sdRoundBox",
        "scale": [1.0, 1.2, 0.8],
        "color": [0.8, 0.5, 0.4],
        "parent": null,
        "relative_pos": [0, 0, 0],
        "connection_type": "smooth_union",
        "symmetry_pair": null,
        "deformation": "none"
      },
      {
        "id": "head",
        "semantic_role": "head",
        "sdf_primitive": "sdSphere",
        "scale": [0.6, 0.6, 0.6],
        "color": [0.9, 0.6, 0.5],
        "parent": "torso_core",
        "relative_pos": [0, 1.5, 0.2],
        "connection_type": "smooth_union",
        "symmetry_pair": null,
        "deformation": "none"
      },
      {
        "id": "arm_L_upper",
        "semantic_role": "limb_segment",
        "sdf_primitive": "sdCapsule",
        "scale": [0.2, 1.2, 0.2],
        "color": [0.7, 0.4, 0.3],
        "parent": "torso_core",
        "relative_pos": [0.8, 0.8, 0],
        "connection_type": "ball_joint",
        "symmetry_pair": "arm_R_upper", // Implies mirroring
        "deformation": "taper_bottom"
      },
      {
        "id": "leg_L_upper",
        "semantic_role": "limb_segment",
        "sdf_primitive": "sdCapsule",
        "scale": [0.3, 1.5, 0.3],
        "color": [0.7, 0.4, 0.3],
        "parent": "torso_core",
        "relative_pos": [0.5, -1.0, 0],
        "connection_type": "rigid_union",
        "symmetry_pair": "leg_R_upper",
        "deformation": "none"
      },
      {
        "id": "eye_L",
        "semantic_role": "decoration",
        "sdf_primitive": "sdSphere",
        "scale": [0.15, 0.15, 0.15],
        "color": [0.1, 0.1, 0.1],
        "parent": "head",
        "relative_pos": [0.25, 0.1, 0.5],
        "connection_type": "subtract", // Carve out eye socket? Or maybe just add? Let's use subtract to test.
        "symmetry_pair": "eye_R",
        "deformation": "none"
      }
    ]
  }
};
