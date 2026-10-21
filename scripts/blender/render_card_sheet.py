"""Blender side of the card sprite sheet pipeline.

Reads a job file (JSON) with a list of card specs and renders, for every
card, the 20 frames of the 4x5 sprite sheet:

    row 1  red  - walk   (front view, 5 frames)
    row 2  red  - attack (front view, 5 frames)
    row 3  blue - walk   (back view,  5 frames)
    row 4  blue - attack (back view,  5 frames)

The frames are written as `<out>/<card>/r<row>c<col>.png` and packed into
`docs/card-art/sheets/<card>.png` by `scripts/make_card_sheets.py`.

Run (usually through the driver script):

    blender --background --python scripts/blender/render_card_sheet.py -- <job.json> <outdir>
"""

from __future__ import annotations

import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

FRAMES_PER_ROW = 5
COLS = 5
ROWS = 4
RES = 192  # rendered size; the driver downsamples to 96x96 (antialiasing)

# ---------------------------------------------------------------------------
# helpers


def job_args() -> list[str]:
    if "--" in sys.argv:
        return sys.argv[sys.argv.index("--") + 1 :]
    return []


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = RES
    scene.render.resolution_y = RES
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"

    world = bpy.data.worlds.new("SheetWorld")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (1.0, 1.0, 1.0, 1.0)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    scene.world = world

    # key light + fill so the low poly shapes read at 96px
    sun_data = bpy.data.lights.new("Key", type="SUN")
    sun_data.energy = 3.0
    sun_data.angle = math.radians(20)
    sun = bpy.data.objects.new("Key", sun_data)
    sun.rotation_euler = (math.radians(55), 0.0, math.radians(35))
    scene.collection.objects.link(sun)

    fill_data = bpy.data.lights.new("Fill", type="SUN")
    fill_data.energy = 1.2
    fill = bpy.data.objects.new("Fill", fill_data)
    fill.rotation_euler = (math.radians(65), 0.0, math.radians(-140))
    scene.collection.objects.link(fill)

    cam_data = bpy.data.cameras.new("SheetCam")
    cam_data.type = "ORTHO"
    cam = bpy.data.objects.new("SheetCam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam


def import_gltf(path: str) -> None:
    bpy.ops.import_scene.gltf(filepath=path)


def find_armature() -> bpy.types.Object | None:
    for obj in bpy.data.objects:
        if obj.type == "ARMATURE":
            return obj
    return None


def visible_meshes() -> list[bpy.types.Object]:
    return [o for o in bpy.data.objects if o.type == "MESH" and not o.hide_render]


def set_action(arm: bpy.types.Object, name: str) -> tuple[float, float]:
    action = bpy.data.actions.get(name)
    if action is None:
        raise KeyError(f"animation {name} not found")
    arm.animation_data_create()
    arm.animation_data.action = action
    start, end = action.frame_range
    return float(start), float(end)


def attach_to_bone(obj: bpy.types.Object, arm: bpy.types.Object, bone: str) -> None:
    """Rigidly attach `obj` to a bone, keeping its current world transform."""
    if bone not in arm.pose.bones:
        return
    bpy.context.view_layer.update()
    pb = arm.pose.bones[bone]
    con = obj.constraints.new("CHILD_OF")
    con.target = arm
    con.subtarget = bone
    con.influence = 1.0
    bone_matrix = arm.matrix_world @ pb.matrix @ Matrix.Translation(pb.tail)
    con.inverse_matrix = bone_matrix.inverted()


def tint_materials(color: list[float]) -> None:
    """Multiply every base colour texture with `color` (per card palette)."""
    if not color or all(abs(c - 1.0) < 0.001 for c in color):
        return
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        tree = mat.node_tree
        for node in list(tree.nodes):
            if node.type != "TEX_IMAGE" or not node.outputs:
                continue
            out = node.outputs["Color"]
            if not out.is_linked:
                continue
            for link in list(out.links):
                target = link.to_socket
                mix = tree.nodes.new("ShaderNodeMixRGB")
                mix.blend_type = "MULTIPLY"
                mix.inputs[0].default_value = 1.0
                mix.inputs[2].default_value = (color[0], color[1], color[2], 1.0)
                tree.links.new(out, mix.inputs[1])
                tree.links.new(mix.outputs[0], target)
                break


def make_orb(radius: float, rgb: tuple[float, float, float]) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, segments=12, ring_count=8)
    orb = bpy.context.object
    orb.name = "MagicOrb"
    mat = bpy.data.materials.new("MagicOrbMat")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
            bsdf.inputs["Emission Strength"].default_value = 1.1
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = 0.35
    orb.data.materials.append(mat)
    return orb


def world_bounds(meshes: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for ob in meshes:
        for corner in ob.bound_box:
            world = ob.matrix_world @ Vector(corner)
            for i in range(3):
                lo[i] = min(lo[i], world[i])
                hi[i] = max(hi[i], world[i])
    if lo.x > hi.x:
        lo = Vector((-1, -1, 0))
        hi = Vector((1, 1, 1))
    return lo, hi


def frame_camera(cam: bpy.types.Object, meshes: list[bpy.types.Object]) -> None:
    lo, hi = world_bounds(meshes)
    height = max(1e-3, hi.z - lo.z)
    width = max(1e-3, hi.x - lo.x)
    depth = max(1e-3, hi.y - lo.y)
    cell = max(height, width, depth) * 1.12
    cam.data.ortho_scale = cell
    # feet near the bottom of the cell, head near the top
    cam_z = lo.z + 0.52 * cell
    cam.location = Vector((0.0, -12.0, cam_z))
    direction = Vector((0.0, 1.0, 0.0))
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def aim_camera(cam: bpy.types.Object, side: str, z: float) -> None:
    """side: 'front' (character faces -Y) or 'back'."""
    y = -12.0 if side == "front" else 12.0
    cam.location = Vector((cam.location.x, y, z))
    direction = Vector((0.0, 1.0 if side == "front" else -1.0, 0.0))
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def render_to(path: str) -> None:
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


# ---------------------------------------------------------------------------
# procedural props (buildings, spells, towers)


def simple_material(name: str, rgb: tuple[float, float, float], rough: float = 0.6) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
        bsdf.inputs["Roughness"].default_value = rough
    return mat


def animated_bounds(arm: bpy.types.Object, poses: list[int]) -> tuple[Vector, Vector]:
    """The world bounding box of the character over every animation pose."""
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for frame in poses:
        bpy.context.scene.frame_set(int(frame))
        depsgraph = bpy.context.evaluated_depsgraph_get()
        for ob in visible_meshes():
            evaluated = ob.evaluated_get(depsgraph)
            for corner in evaluated.bound_box:
                world = evaluated.matrix_world @ Vector(corner)
                for i in range(3):
                    lo[i] = min(lo[i], world[i])
                    hi[i] = max(hi[i], world[i])
    if lo.x > hi.x:
        lo = Vector((-1, -1, 0))
        hi = Vector((1, 1, 1))
    return lo, hi


def frame_camera_bounds(cam: bpy.types.Object, lo: Vector, hi: Vector) -> None:
    """Frame the camera so that nothing is cropped, feet near the bottom."""
    height = max(1e-3, hi.z - lo.z)
    width = max(1e-3, hi.x - lo.x)
    depth = max(1e-3, hi.y - lo.y)
    cell = max(height, width, depth) * 1.08
    cam.data.ortho_scale = cell
    cam.location.x = (lo.x + hi.x) / 2
    cam.location.z = lo.z + 0.48 * cell


def add_primitive(kind: str, **kwargs) -> bpy.types.Object:
    vertices = int(kwargs.get("vertices", 16))
    if kind == "cube":
        bpy.ops.mesh.primitive_cube_add(size=1.0)
    elif kind == "cylinder":
        bpy.ops.mesh.primitive_cylinder_add(
            radius=float(kwargs.get("radius", 0.4)),
            depth=float(kwargs.get("depth", 1.0)),
            vertices=vertices,
        )
    elif kind == "cone":
        bpy.ops.mesh.primitive_cone_add(
            radius1=float(kwargs.get("radius", 0.4)),
            radius2=float(kwargs.get("radius2", kwargs.get("radius", 0.4))),
            depth=float(kwargs.get("depth", 1.0)),
            vertices=vertices,
        )
    elif kind == "sphere":
        bpy.ops.mesh.primitive_uv_sphere_add(
            radius=float(kwargs.get("radius", 0.3)),
            segments=16,
            ring_count=10,
        )
    elif kind == "torus":
        bpy.ops.mesh.primitive_torus_add(
            major_radius=float(kwargs.get("radius", 0.4)),
            minor_radius=float(kwargs.get("minor", 0.08)),
            major_segments=16,
            minor_segments=8,
        )
    else:
        raise ValueError(f"unknown primitive {kind}")
    ob = bpy.context.object
    if kwargs.get("size"):
        s = kwargs["size"]
        ob.scale = (float(s[0]), float(s[1]), float(s[2]))
    if kwargs.get("rot"):
        ob.rotation_euler = tuple(math.radians(a) for a in kwargs["rot"])
    color = kwargs.get("color", [0.7, 0.7, 0.7])
    mat = simple_material(f"{ob.name}Mat", tuple(color), float(kwargs.get("rough", 0.6)))
    if kwargs.get("emissive"):
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Emission Color"].default_value = (color[0], color[1], color[2], 1.0)
            bsdf.inputs["Emission Strength"].default_value = float(kwargs.get("emission", 1.1))
    ob.data.materials.append(mat)
    return ob


def build_attachment(part: dict, arm: bpy.types.Object) -> bpy.types.Object:
    """A piece of extra geometry bound to a bone (wings, a belly, a barrel)."""
    ob = add_primitive(part.get("type", "cube"), **part)
    ob.name = part.get("name", "attachment")
    bone = part.get("bone")
    if bone:
        if bone not in arm.pose.bones:
            return ob
        bpy.context.view_layer.update()
        pb = arm.pose.bones[bone]
        anchor = pb.tail if part.get("anchor", "tail") == "tail" else pb.head
        base = arm.matrix_world @ anchor
        offset = part.get("offset", [0, 0, 0])
        ob.location = base + Vector((float(offset[0]), float(offset[1]), float(offset[2])))
    elif part.get("loc"):
        loc = part["loc"]
        ob.location = Vector((float(loc[0]), float(loc[1]), float(loc[2])))
    attach_to_bone(ob, arm, bone or "chest")
    return ob


def build_prop(spec: dict) -> dict:
    """Build a card out of primitives (a building, a spell, a tower)."""
    prop = spec["prop"]
    parts: list[bpy.types.Object] = []
    glow: list[bpy.types.Object] = []
    for index, part in enumerate(prop["parts"]):
        ob = add_primitive(part.get("type", "cube"), **part)
        ob.name = part.get("name", f"part{index}")
        if "loc" in part:
            loc = part["loc"]
            ob.location = (float(loc[0]), float(loc[1]), float(loc[2]))
        parts.append(ob)
        if part.get("glow"):
            glow.append(ob)
    return {"parts": parts, "glow": glow}


def render_prop(spec: dict, prop: dict, out: str) -> None:
    cam = bpy.data.objects["SheetCam"]
    meshes = visible_meshes()
    frame_camera(cam, meshes)
    glow = prop["glow"]
    for ob in glow:
        ob["base_scale"] = list(ob.scale)

    def draw_rows(charging: bool) -> None:
        cam_z = cam.location.z
        for row, side in ((0, "front"), (2, "back")):
            aim_camera(cam, side, cam_z)
            for col in range(FRAMES_PER_ROW):
                pulse = 0.9 + 0.1 * math.sin(col / FRAMES_PER_ROW * math.tau)
                for ob in glow:
                    base = ob["base_scale"]
                    ob.scale = tuple(b * pulse for b in base)
                bpy.context.scene.frame_set(1)
                render_to(os.path.join(out, f"r{row}c{col}.png"))
        for row, side in ((1, "front"), (3, "back")):
            aim_camera(cam, side, cam_z)
            for col in range(FRAMES_PER_ROW):
                t = col / (FRAMES_PER_ROW - 1)
                for ob in glow:
                    base = ob["base_scale"]
                    ob.scale = tuple(b * ((0.7 + 0.7 * t) if charging else 1.0) for b in base)
                bpy.context.scene.frame_set(1)
                render_to(os.path.join(out, f"r{row}c{col}.png"))

    draw_rows(charging=False)
    draw_rows(charging=True)

    for ob in glow:
        base = ob["base_scale"]
        ob.scale = tuple(base)


# ---------------------------------------------------------------------------
# per card


def build_card(spec: dict) -> None:
    reset_scene()
    out = os.path.join(spec["out"], spec["id"])
    os.makedirs(out, exist_ok=True)

    if spec.get("prop"):
        prop = build_prop(spec)
        render_prop(spec, prop, out)
        return

    import_gltf(spec["model"])
    arm = find_armature()
    if arm is None:
        raise RuntimeError(f"{spec['id']}: no armature in {spec['model']}")

    # scale the whole rig (the meshes are children of the armature, so they
    # inherit the scale - scaling them again would double it)
    scale = float(spec.get("scale", 1.0))
    if scale != 1.0:
        arm.scale = (scale, scale, scale)

    # show the body (every deformed mesh) plus the requested gear
    gear = set(spec.get("gear", []))
    for ob in bpy.data.objects:
        if ob.type != "MESH":
            continue
        skinned = any(m.type == "ARMATURE" for m in ob.modifiers)
        if skinned or ob.name in gear:
            ob.hide_render = False
            ob.hide_viewport = False
        else:
            ob.hide_render = True
            ob.hide_viewport = True

    # the weapon that is not part of the character file
    weapon = spec.get("weapon")
    if weapon:
        import_gltf(weapon["file"])
        for ob in list(bpy.data.objects):
            if ob.type == "MESH" and ob.name == weapon.get("mesh", ""):
                wscale = float(weapon.get("scale", 1.0))
                if wscale != 1.0:
                    ob.scale = (wscale, wscale, wscale)
                rot = weapon.get("rot")
                if rot:
                    ob.rotation_euler = tuple(math.radians(a) for a in rot)
                attach_to_bone(ob, arm, weapon.get("bone", "hand.r"))
                break

    tint_materials(spec.get("tint", []))

    # extra geometry bound to the bones (wings, a belly, a barrel, a cannon)
    for attachment in spec.get("attachments", []):
        build_attachment(attachment, arm)

    # the magic orb (only visible in the attack rows)
    magic = spec.get("magic")
    orb = None
    if magic and magic.get("orb"):
        orb = make_orb(float(magic.get("radius", 0.22)), tuple(magic["orb"]))
        bone = magic.get("bone", "hand.r")
        if bone in arm.pose.bones:
            pb = arm.pose.bones[bone]
            orb.location = arm.matrix_world @ pb.tail
        attach_to_bone(orb, arm, bone)

    cam = bpy.data.objects["SheetCam"]

    # --- the four rows -----------------------------------------------------
    walk = spec["walk"]
    walk_range = set_action(arm, walk)
    attack = spec["attack"]
    attack_range = set_action(arm, attack)

    # a flying unit hovers instead of walking
    hover = spec.get("hover")
    hover_height = float(hover.get("height", 0.0)) if hover else 0.0
    hover_bob = float(hover.get("bob", 0.0)) if hover else 0.0

    # frame the camera on the *animated* extent of the character so that no
    # frame is ever cropped (a big axe swing must stay inside the cell)
    walk_start, walk_end = walk_range
    walk_span = walk_end - walk_start
    attack_start, attack_end = attack_range
    attack_span = attack_end - attack_start
    poses = [int(round(walk_start + walk_span * col / FRAMES_PER_ROW)) for col in range(FRAMES_PER_ROW)]
    poses += [int(round(attack_start + attack_span * (col + 0.5) / FRAMES_PER_ROW)) for col in range(FRAMES_PER_ROW)]
    lo, hi = animated_bounds(arm, poses)
    lo = lo + Vector((0, 0, hover_height))
    hi = hi + Vector((0, 0, hover_height))
    frame_camera_bounds(cam, lo, hi)

    def draw_rows(attack_orb: bool) -> None:
        cam_z = cam.location.z
        if orb is not None:
            orb.hide_render = not attack_orb
        for row, side in ((0, "front"), (2, "back")):
            aim_camera(cam, side, cam_z)
            for col in range(FRAMES_PER_ROW):
                frame = walk_start + walk_span * col / FRAMES_PER_ROW
                arm.location.z = hover_height + hover_bob * math.sin(col / FRAMES_PER_ROW * math.tau)
                bpy.context.scene.frame_set(int(round(frame)))
                render_to(os.path.join(out, f"r{row}c{col}.png"))
        for row, side in ((1, "front"), (3, "back")):
            aim_camera(cam, side, cam_z)
            for col in range(FRAMES_PER_ROW):
                frame = attack_start + attack_span * (col + 0.5) / FRAMES_PER_ROW
                arm.location.z = hover_height + hover_bob * math.sin(col / FRAMES_PER_ROW * math.tau)
                bpy.context.scene.frame_set(int(round(frame)))
                render_to(os.path.join(out, f"r{row}c{col}.png"))

    draw_rows(attack_orb=False)
    draw_rows(attack_orb=True)


def main() -> None:
    args = job_args()
    job = json.loads(open(args[0], encoding="utf-8-sig").read())
    out = args[1]
    os.makedirs(out, exist_ok=True)
    only = set(args[2].split(",")) if len(args) > 2 and args[2] else None
    for spec in job:
        if only and spec["id"] not in only:
            continue
        try:
            build_card(spec)
            print(f"[sheet] {spec['id']} rendered", flush=True)
        except Exception as exc:  # keep the batch alive
            print(f"[sheet] {spec['id']} FAILED: {exc}", flush=True)


if __name__ == "__main__":
    main()
