export const TEST_WINGS = {
  "phenotype_id": "TEST-WINGS-V1",
  "behavior_profile": {
    "personality": "curious",
    "locomotion_style": "hovering"
  },
  "style_parameters": {
    "smoothness": 0.2,
    "chaos_factor": 0.0,
    "primary_material": "chitin_shell"
  },
  "topology_graph": {
    "root_node": "core",
    "nodes": [
      {
        "id": "core",
        "semantic_role": "core",
        "sdf_primitive": "sdSphere",
        "scale": [1.0, 1.0, 1.0],
        "color": [0.2, 0.2, 0.2],
        "parent": null,
        "relative_pos": [0, 0, 0],
        "connection_type": "smooth_union",
        "symmetry_pair": null,
        "deformation": "none"
      },
      {
        "id": "wing_base_L",
        "semantic_role": "limb_segment",
        "sdf_primitive": "sdSphere",
        "scale": [1.5, 0.1, 0.8], // Flat wing
        "color": [0.8, 0.2, 0.2],
        "parent": "core",
        "relative_pos": [1.0, 0.5, 0.0],
        "connection_type": "ball_joint",
        "symmetry_pair": "wing_base_R", // Mirror
        "deformation": "none"
      },
      {
        "id": "feathers_L",
        "semantic_role": "decoration",
        "sdf_primitive": "sdSphere", // Flat feather
        "scale": [0.8, 0.05, 0.3],
        "color": [0.9, 0.8, 0.1],
        "parent": "wing_base_L",
        "relative_pos": [1.0, 0.0, 0.0], // Tip of wing base
        "connection_type": "rigid_union",
        "symmetry_pair": "feathers_R",
        "deformation": "none",
        "layout": {
            "type": "radial",
            "count": 5,
            "axis": "z",
            "spread": 60
        }
      },
      {
          "id": "spine_spikes",
          "semantic_role": "weapon",
          "sdf_primitive": "sdCone",
          "scale": [0.2, 0.6, 0.2],
          "color": [1.0, 1.0, 1.0],
          "parent": "core",
          "relative_pos": [0.0, 0.8, -0.2],
          "connection_type": "rigid_union",
          "symmetry_pair": null,
          "deformation": "none",
          "layout": {
              "type": "linear",
              "count": 4,
              "axis": "z", // Along spine (Z?) Usually Y is up. If creature faces Z? Let's try Z.
              "spread": 1.5
          }
      }
    ]
  }
};
