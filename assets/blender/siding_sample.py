"""
Windy City Exteriors — Blender authoring proof: one lap siding sample.

WHAT THIS IS
    A reproducible, headless Blender script that builds a small architectural
    sample of the approved traditional Chicagoland wall: fibre-cement lap
    siding over a weather barrier, cut around a window, with 5/4 casing, a
    head casing and drip cap, a sloped sill, a recessed sash, and a corner
    board with a short return so the sample reads as a corner rather than as
    a flat card.

    It is a pipeline proof, not a design proposal and not a house. Everything
    it makes is geometry with real thickness: the lap shadow under each butt
    edge is 7.9 mm of actual board, not a texture, and the casing stands
    9.2 mm proud of the siding butt because 5/4 trim is 25 mm and the siding
    butt projects 15.8 mm. Those two numbers are the whole point of the
    exercise — they are what a renderer cannot fake and what tells a
    homeowner they are looking at a wall.

USAGE (on the Mac, Blender 5.2.2 LTS)
    /Applications/Blender.app/Contents/MacOS/Blender \
        --background --factory-startup \
        --python assets/blender/siding_sample.py -- --out assets/blender/out

    Add --preview for a fast, noisy render while iterating; add --skip-render
    to build, save and export without rendering at all.

OUTPUTS (all under --out)
    wce_siding_sample.blend   the authored scene
    wce_siding_sample.png     the render
    wce_siding_sample.glb     named meshes, for the pipeline proof
    report.txt                what actually happened, including anything the
                              script could not do on this Blender build

CONVENTIONS
    Metres throughout. The main wall runs along +X, faces +Y, and Z is up.
    y = 0 is the outer face of the sheathing. Everything outboard of the
    sheathing has a positive y. The return wall is the same builder called a
    second time and rotated, so there is one description of a wall, not two.
"""

from __future__ import annotations

import argparse
import math
import os
import sys
import traceback

import bpy  # type: ignore
import bmesh  # type: ignore
from mathutils import Euler, Matrix, Vector  # type: ignore


# ---------------------------------------------------------------------------
# Dimensions. Real products, in metres, so a reviewer can check them against
# a submittal rather than against taste.
# ---------------------------------------------------------------------------

# Fibre-cement lap siding, 8-1/4 in board at a 7 in exposure.
BOARD_WIDTH = 0.210          # 8-1/4"
BOARD_EXPOSURE = 0.178       # 7"
BOARD_THICKNESS = 0.0079     # 5/16"
STARTER_THICKNESS = 0.0064   # 1/4" starter strip under the first course

WRB = 0.0006                 # weather-resistive barrier, drawn so it exists

# 5/4 trim: 25 mm thick, 89 mm face (nominal 1x4).
TRIM_THICKNESS = 0.025
TRIM_FACE = 0.089
HEAD_THICKNESS = 0.032       # head casing is heavier than the legs
DRIP_PROJECTION = 0.014      # drip cap over the head casing
SILL_PROJECTION = 0.030
SILL_SLOPE = 0.012           # fall across the sill, so water leaves

# The sample.
WALL_LENGTH = 2.40
WALL_HEIGHT = 2.40
RETURN_LENGTH = 0.38         # short return so the corner board has a corner
SHEATHING_THICKNESS = 0.012
WALL_DEPTH = 0.152           # 2x6 framing behind the sheathing, so the
                             # opening has something to be recessed into

# Window rough opening, centred on the main wall.
RO_WIDTH = 0.900
RO_HEIGHT = 1.200
RO_SILL_Z = 0.850

# How far the glass sits back from the casing face. A window set flush with
# the trim is the single most common tell in an architectural render.
GLASS_SETBACK = 0.070

# Sun. One elevation and azimuth drives the lamp and the sky texture, so the
# light on the wall and the light in the world can never disagree — that
# disagreement is a mistake worth designing out rather than remembering.
# Low and well off the wall's normal on purpose. A sun square to an
# elevation lights it evenly and flattens the very thing this sample is for:
# the lap shadow is cast by a 7.9 mm butt edge, so it is only as long as the
# sun is oblique. At 33 degrees it measures about 12 mm, which reads.
SUN_ELEVATION_DEG = 33.0
SUN_AZIMUTH_DEG = 152.0      # measured from +X, counter-clockwise about +Z
SUN_ANGULAR_DIAMETER_DEG = 0.526   # the real sun, which is why nothing is razor sharp

# Daylight balance. Outdoors the sun beats the sky by roughly five to one on
# a surface square to it, and getting that ratio wrong is what makes a render
# look like an overcast photograph of a model. Both are overridable.
# Measured off the frame rather than guessed: at these two values a porcelain
# board in sun sits about four and a half times brighter than the same board
# on the shaded return, which is about what open shade measures on a clear
# day. Raising the sun alone does not fix a flat frame — it only drives the
# lit face into the roll-off while the shaded one stays where it was. The
# thing that was wrong was the sky, and the sky is what had to come down.
SUN_ENERGY = 8.0
SKY_STRENGTH = 0.032

NOTES: list[str] = []


def note(message: str) -> None:
    """Record something the reviewer needs to know, and echo it now."""
    NOTES.append(message)
    print(f"[wce] {message}")


# ---------------------------------------------------------------------------
# Small mesh helpers. Everything is built from explicit vertices rather than
# from operators: operators depend on selection state and a context that does
# not exist in background mode, and they make a script that reads like a
# recording of mouse clicks instead of a description of a wall.
# ---------------------------------------------------------------------------

def _finish(name: str, verts, faces, collection) -> "bpy.types.Object":
    """Build an object from vertices and faces, with normals made consistent."""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    mesh.validate(verbose=False)

    # Winding is easy to get wrong by hand and invisible until something is
    # lit from the wrong side, so it is recalculated rather than trusted.
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


def box(name, x0, x1, y0, y1, z0, z1, collection):
    """An axis-aligned solid. Used for everything that is not a lapped board."""
    v = [
        (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
        (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1),
    ]
    f = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (2, 3, 7, 6), (1, 2, 6, 5), (3, 0, 4, 7)]
    return _finish(name, v, f, collection)


def plank(name, x0, x1, z_butt, collection):
    """
    One course of lap siding, as the board actually sits.

    The top edge lies against the barrier; the bottom edge rides on the top
    of the course below, so the board leans out by its own thickness over its
    width — about two and a quarter degrees. That lean is why the butt edge
    stands 15.8 mm proud, why there is a shadow under every course, and why a
    flat plane with a siding texture on it never looks like siding.
    """
    z_top = z_butt + BOARD_WIDTH
    y_back_butt = WRB + BOARD_THICKNESS
    y_back_top = WRB

    length = math.hypot(BOARD_WIDTH, BOARD_THICKNESS)
    ny = BOARD_WIDTH / length
    nz = BOARD_THICKNESS / length
    dy = BOARD_THICKNESS * ny
    dz = BOARD_THICKNESS * nz

    v = [
        (x0, y_back_butt, z_butt), (x1, y_back_butt, z_butt),
        (x1, y_back_top, z_top), (x0, y_back_top, z_top),
        (x0, y_back_butt + dy, z_butt + dz), (x1, y_back_butt + dy, z_butt + dz),
        (x1, y_back_top + dy, z_top + dz), (x0, y_back_top + dy, z_top + dz),
    ]
    f = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (2, 3, 7, 6), (1, 2, 6, 5), (3, 0, 4, 7)]
    return _finish(name, v, f, collection)


def bevel(obj, width=0.0012, segments=2):
    """
    A hair of bevel on every trim arris.

    No milled edge is mathematically sharp, and a mathematically sharp edge
    cannot catch the sky, so it reads as computer-generated however good the
    material is. 1.2 mm is about what a factory eased edge measures.
    """
    mod = obj.modifiers.new(name="edge", type="BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(40.0)
    mod.harden_normals = False
    return mod


# ---------------------------------------------------------------------------
# Materials. Restrained on purpose: the sample exists to show depth and
# light, and a loud material hides both.
# ---------------------------------------------------------------------------

def ensure_nodes(datablock):
    """
    Make sure the datablock has a shader node tree, on 4.x and on 5.x alike.

    Blender 5 gives materials and worlds a node tree from the start and marks
    `use_nodes` deprecated for removal in 6.0; Blender 4 needs it set. Asking
    whether the tree is already there satisfies both without a version check.
    """
    if getattr(datablock, "node_tree", None) is None:
        datablock.use_nodes = True
    return datablock.node_tree


def _principled(mat):
    return ensure_nodes(mat).nodes["Principled BSDF"]


def _set(node, socket_name, value):
    """
    Set a Principled input by name, and say so if the name is not there.

    Principled socket names have moved between Blender versions ("Specular"
    became "Specular IOR Level", transmission and coat were renamed), so a
    script that assumes one spelling fails on the other. This asks.
    """
    socket = node.inputs.get(socket_name)
    if socket is None:
        note(f"Principled BSDF has no input named '{socket_name}' on this build; skipped.")
        return False
    socket.default_value = value
    return True


def painted(name, rgb, roughness, sheen=0.0, variation=0.0):
    """A painted board. Optionally with a slow drift in roughness across it."""
    mat = bpy.data.materials.new(name)
    bsdf = _principled(mat)
    _set(bsdf, "Base Color", (*rgb, 1.0))
    _set(bsdf, "Roughness", roughness)
    _set(bsdf, "Metallic", 0.0)
    _set(bsdf, "IOR", 1.47)
    if sheen:
        _set(bsdf, "Sheen Weight", sheen)

    if variation > 0.0:
        # Paint is never one roughness. A large, low-contrast noise is enough
        # to stop a whole elevation reading as a single moulded object.
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        coord = nodes.new("ShaderNodeTexCoord")
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 3.5
        noise.inputs["Detail"].default_value = 4.0
        ramp = nodes.new("ShaderNodeMapRange")
        ramp.inputs["From Min"].default_value = 0.35
        ramp.inputs["From Max"].default_value = 0.65
        ramp.inputs["To Min"].default_value = max(0.0, roughness - variation)
        ramp.inputs["To Max"].default_value = min(1.0, roughness + variation)
        links.new(coord.outputs["Object"], noise.inputs["Vector"])
        links.new(noise.outputs["Fac"], ramp.inputs["Value"])
        links.new(ramp.outputs["Result"], bsdf.inputs["Roughness"])
    return mat


def glass_material(name="wce_glass"):
    mat = bpy.data.materials.new(name)
    bsdf = _principled(mat)
    _set(bsdf, "Base Color", (1.0, 1.0, 1.0, 1.0))
    _set(bsdf, "Roughness", 0.02)
    _set(bsdf, "IOR", 1.52)
    if not _set(bsdf, "Transmission Weight", 1.0):
        _set(bsdf, "Transmission", 1.0)
    mat.use_backface_culling = False
    return mat


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


# ---------------------------------------------------------------------------
# The wall
# ---------------------------------------------------------------------------

def wall_panel(prefix, name, y0, y1, length, opening, collection, mat):
    """
    A layer of wall with the rough opening actually missing from it.

    Four boxes rather than one, because a window in front of an unbroken
    panel has nothing behind the glass: the pane ends up mirroring the sky
    with a wall immediately behind it, which is neither what glass does nor
    what a hole in a wall does.
    """
    made = []
    if opening is None:
        made.append(box(f"{prefix}_{name}", 0.0, length, y0, y1, 0.0, WALL_HEIGHT, collection))
    else:
        ox0, ox1, oz0, oz1 = opening
        for tag, (x0, x1, z0, z1) in (
            ("l", (0.0, ox0, 0.0, WALL_HEIGHT)),
            ("r", (ox1, length, 0.0, WALL_HEIGHT)),
            ("b", (ox0, ox1, 0.0, oz0)),
            ("t", (ox0, ox1, oz1, WALL_HEIGHT)),
        ):
            if x1 - x0 < 1e-4 or z1 - z0 < 1e-4:
                continue
            made.append(box(f"{prefix}_{name}_{tag}", x0, x1, y0, y1, z0, z1, collection))
    for obj in made:
        assign(obj, mat)
    return made


def build_wall(prefix, length, collection, mats, window=None, stop_left=0.0, stop_right=0.0):
    """
    One wall, in its own local frame: along +X, facing +Y, sitting on z = 0.

    `window` is (x_centre, sill_z, width, height) or None. `stop_left` and
    `stop_right` are how far the siding holds off each end, which is where the
    corner board lands.
    """
    made = []
    x_a = stop_left
    x_b = length - stop_right

    opening = None
    if window is not None:
        wx, wz, ww, wh = window
        opening = (wx - ww / 2.0, wx + ww / 2.0, wz, wz + wh)

    made += wall_panel(prefix, "framing", -WALL_DEPTH, -SHEATHING_THICKNESS,
                       length, opening, collection, mats["framing"])
    made += wall_panel(prefix, "sheathing", -SHEATHING_THICKNESS, 0.0,
                       length, opening, collection, mats["sheathing"])
    made += wall_panel(prefix, "barrier", 0.0, WRB, length, opening, collection, mats["barrier"])

    if opening is not None:
        # A room, or at least the far side of one. A window with daylight
        # behind it reads as a hole in a card; every real window on a sunny
        # elevation is darker than the wall around it.
        made.append(box(f"{prefix}_interior", opening[0] - 0.4, opening[1] + 0.4,
                        -0.90, -0.88, opening[2] - 0.6, opening[3] + 0.4, collection))
        assign(made[-1], mats["interior"])

    # The starter strip. Without it the first course has nothing to lean on
    # and lies flat against the wall, which is exactly how the bottom of a
    # badly modelled elevation gives itself away.
    made.append(box(f"{prefix}_starter", x_a, x_b, WRB, WRB + STARTER_THICKNESS,
                    0.0, BOARD_EXPOSURE * 0.5, collection))
    assign(made[-1], mats["trim"])

    casing = None
    if window is not None:
        wx, wz, ww, wh = window
        casing = (
            wx - ww / 2.0 - TRIM_FACE, wx + ww / 2.0 + TRIM_FACE,
            wz - TRIM_FACE, wz + wh + TRIM_FACE,
        )

    course_index = 0
    z = 0.0
    while z < WALL_HEIGHT - TRIM_FACE - 0.01:
        z_top = z + BOARD_WIDTH
        spans = [(x_a, x_b)]
        if casing is not None and z_top > casing[2] and z < casing[3]:
            spans = [(x_a, casing[0]), (casing[1], x_b)]

        for i, (sx, ex) in enumerate(spans):
            if ex - sx < 0.004:
                continue
            name = f"{prefix}_siding_course_{course_index:02d}" + ("" if len(spans) == 1 else f"_{i}")
            obj = plank(name, sx, ex, z, collection)
            assign(obj, mats["siding"])
            made.append(obj)

        course_index += 1
        z += BOARD_EXPOSURE

    # A frieze board. Siding has to die into something at the top of a wall,
    # and a sample that simply stops mid-course reads as a cut-out rather
    # than as a piece of a building.
    frieze = box(f"{prefix}_frieze", x_a, x_b, WRB, WRB + TRIM_THICKNESS,
                 WALL_HEIGHT - TRIM_FACE, WALL_HEIGHT, collection)
    assign(frieze, mats["trim"])
    bevel(frieze)
    made.append(frieze)

    if window is not None:
        made.extend(build_window(prefix, window, collection, mats))

    return made


def build_window(prefix, window, collection, mats):
    """Casing, head, drip cap, sill, jamb, sash and glass, all with thickness."""
    wx, wz, ww, wh = window
    made = []

    o0, o1 = wx - ww / 2.0, wx + ww / 2.0          # rough opening
    c0, c1 = o0 - TRIM_FACE, o1 + TRIM_FACE        # outside of the leg casings
    head_z = wz + wh

    y0 = WRB
    y1 = WRB + TRIM_THICKNESS                      # 25 mm: proud of the 15.8 mm butt

    # Leg casings, running from the sill up to the underside of the head.
    for side, (sx, ex) in (("l", (c0, o0)), ("r", (o1, c1))):
        obj = box(f"{prefix}_casing_{side}", sx, ex, y0, y1, wz, head_z, collection)
        assign(obj, mats["trim"])
        bevel(obj)
        made.append(obj)

    # Head casing, run past the legs the way a head is actually cut.
    head = box(f"{prefix}_casing_head", c0, c1, y0, WRB + HEAD_THICKNESS,
               head_z, head_z + TRIM_FACE, collection)
    assign(head, mats["trim"])
    bevel(head)
    made.append(head)

    # Drip cap: a sloped cover over the head, projecting past it. This is the
    # detail that keeps water out of the head joint, and it is also the line
    # that tells you the window was flashed rather than dropped into a hole.
    dz0 = head_z + TRIM_FACE
    dy1 = WRB + HEAD_THICKNESS + DRIP_PROJECTION
    v = [
        (c0 - 0.012, y0, dz0), (c1 + 0.012, y0, dz0),
        (c1 + 0.012, dy1, dz0 - 0.004), (c0 - 0.012, dy1, dz0 - 0.004),
        (c0 - 0.012, y0, dz0 + 0.020), (c1 + 0.012, y0, dz0 + 0.020),
        (c1 + 0.012, dy1, dz0 + 0.012), (c0 - 0.012, dy1, dz0 + 0.012),
    ]
    f = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (2, 3, 7, 6), (1, 2, 6, 5), (3, 0, 4, 7)]
    drip = _finish(f"{prefix}_drip_cap", v, f, collection)
    assign(drip, mats["trim"])
    bevel(drip, width=0.0008)
    made.append(drip)

    # Sill, sloped away from the wall so it sheds.
    sy1 = WRB + TRIM_THICKNESS + SILL_PROJECTION
    v = [
        (c0 - 0.016, y0, wz - TRIM_FACE), (c1 + 0.016, y0, wz - TRIM_FACE),
        (c1 + 0.016, sy1, wz - TRIM_FACE), (c0 - 0.016, sy1, wz - TRIM_FACE),
        (c0 - 0.016, y0, wz), (c1 + 0.016, y0, wz),
        (c1 + 0.016, sy1, wz - SILL_SLOPE), (c0 - 0.016, sy1, wz - SILL_SLOPE),
    ]
    sill = _finish(f"{prefix}_sill", v, f, collection)
    assign(sill, mats["trim"])
    bevel(sill, width=0.0010)
    made.append(sill)

    # Jamb, set back so the opening has depth to it.
    jy0 = -WALL_DEPTH
    jy1 = WRB + 0.010
    jamb_w = 0.016
    for side, (sx, ex) in (("l", (o0, o0 + jamb_w)), ("r", (o1 - jamb_w, o1))):
        obj = box(f"{prefix}_jamb_{side}", sx, ex, jy0, jy1, wz, head_z, collection)
        assign(obj, mats["trim"])
        made.append(obj)
    for side, (sz, ez) in (("head", (head_z - jamb_w, head_z)), ("sill", (wz, wz + jamb_w))):
        obj = box(f"{prefix}_jamb_{side}", o0, o1, jy0, jy1, sz, ez, collection)
        assign(obj, mats["trim"])
        made.append(obj)

    # Sash: two stiles, two rails and a meeting rail, all in one mesh so the
    # export carries one named part rather than five.
    sash_y0 = WRB - GLASS_SETBACK
    sash_y1 = sash_y0 + 0.030
    s0, s1 = o0 + jamb_w, o1 - jamb_w
    z0, z1 = wz + jamb_w, head_z - jamb_w
    stile = 0.042
    meet_z = (z0 + z1) / 2.0
    members = [
        (s0, s0 + stile, z0, z1),
        (s1 - stile, s1, z0, z1),
        (s0, s1, z0, z0 + stile),
        (s0, s1, z1 - stile, z1),
        (s0, s1, meet_z - 0.018, meet_z + 0.018),
    ]
    verts, faces = [], []
    for mx0, mx1, mz0, mz1 in members:
        base = len(verts)
        verts += [
            (mx0, sash_y0, mz0), (mx1, sash_y0, mz0), (mx1, sash_y1, mz0), (mx0, sash_y1, mz0),
            (mx0, sash_y0, mz1), (mx1, sash_y0, mz1), (mx1, sash_y1, mz1), (mx0, sash_y1, mz1),
        ]
        faces += [tuple(base + i for i in q) for q in
                  [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (2, 3, 7, 6), (1, 2, 6, 5), (3, 0, 4, 7)]]
    sash = _finish(f"{prefix}_sash", verts, faces, collection)
    assign(sash, mats["trim"])
    made.append(sash)

    glass = box(f"{prefix}_glass", s0, s1, sash_y0 + 0.012, sash_y0 + 0.016, z0, z1, collection)
    assign(glass, mats["glass"])
    made.append(glass)

    return made


def build_corner(collection, mats):
    """
    The corner boards, as an L, with the siding on both walls dying into them.

    A sample without a corner is a card. The corner is where the depth of the
    trim becomes visible rather than inferred.
    """
    x = WALL_LENGTH
    a = box("wce_corner_board_face", x - TRIM_FACE, x, WRB, WRB + TRIM_THICKNESS,
            0.0, WALL_HEIGHT, collection)
    assign(a, mats["trim"])
    bevel(a)

    b = box("wce_corner_board_return", x, x + TRIM_THICKNESS + WRB,
            -TRIM_FACE - WRB, WRB, 0.0, WALL_HEIGHT, collection)
    assign(b, mats["trim"])
    bevel(b)
    return [a, b]


# ---------------------------------------------------------------------------
# Scene
# ---------------------------------------------------------------------------

def sun_vector():
    el = math.radians(SUN_ELEVATION_DEG)
    az = math.radians(SUN_AZIMUTH_DEG)
    return Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))


def add_sun(collection, energy=None):
    light = bpy.data.lights.new("wce_sun", type="SUN")
    light.energy = SUN_ENERGY if energy is None else energy
    light.color = (1.0, 0.957, 0.886)
    light.angle = math.radians(SUN_ANGULAR_DIAMETER_DEG)
    obj = bpy.data.objects.new("wce_sun", light)
    collection.objects.link(obj)

    direction = -sun_vector()          # the lamp points along -sun
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    obj.location = sun_vector() * 20.0
    return obj


def build_world(strength=None):
    """
    A physical sky, aimed at the same sun as the lamp.

    Nishita is in the box, so there is nothing to download and nothing to buy;
    it also gives a real horizon and a real sun disc, which is where the
    highlight on the glass and the metal comes from.
    """
    world = bpy.data.worlds.new("wce_sky")
    bpy.context.scene.world = world
    tree = ensure_nodes(world)
    nodes, links = tree.nodes, tree.links
    nodes.clear()

    bg = nodes.new("ShaderNodeBackground")
    out = nodes.new("ShaderNodeOutputWorld")
    try:
        sky = nodes.new("ShaderNodeTexSky")
    except RuntimeError:
        note("ShaderNodeTexSky is unavailable on this build; the world is a flat grey.")
        bg.inputs["Color"].default_value = (0.52, 0.60, 0.72, 1.0)
        bg.inputs["Strength"].default_value = SKY_STRENGTH if strength is None else strength
        links.new(bg.outputs["Background"], out.inputs["Surface"])
        return world

    # Blender 5 replaced the single "NISHITA" entry with the two scattering
    # models it was always made of; 4.x still calls it Nishita. Preferring
    # multiple scattering first gets the physical sky on either one, and
    # Hosek-Wilkie is the last analytic fallback rather than nothing.
    available = {i.identifier for i in sky.bl_rna.properties["sky_type"].enum_items}
    chosen = next((s for s in ("MULTIPLE_SCATTERING", "SINGLE_SCATTERING", "NISHITA",
                               "HOSEK_WILKIE") if s in available), None)
    if chosen:
        sky.sky_type = chosen
        note(f"Sky model: {chosen} (available: {sorted(available)})")
        for attr, value in (
            ("sun_elevation", math.radians(SUN_ELEVATION_DEG)),
            # Blender measures sun_rotation from +Y; the scene measures azimuth
            # from +X, so the quarter turn between them is applied here once.
            ("sun_rotation", math.radians(SUN_AZIMUTH_DEG - 90.0)),
            # The lamp is the sun. Leaving the sky's own disc on as well
            # double-counts it: the wall gets lit twice and the highlight on
            # the glass lands in a slightly different place from the shadow.
            ("sun_disc", False),
            ("sun_size", math.radians(SUN_ANGULAR_DIAMETER_DEG)),
            ("sun_intensity", 0.6),
            ("altitude", 180.0),
            ("air_density", 1.0),
            ("dust_density", 1.6),
            ("ozone_density", 1.0),
        ):
            if hasattr(sky, attr):
                try:
                    setattr(sky, attr, value)
                except (AttributeError, TypeError) as exc:
                    note(f"Sky texture rejected '{attr}' ({exc}); left at its default.")
            else:
                note(f"Sky texture has no '{attr}' on this build; left at its default.")
    else:
        note(f"No known physical sky model on this build; available: {sorted(available)}.")

    bg.inputs["Strength"].default_value = SKY_STRENGTH if strength is None else strength
    links.new(sky.outputs["Color"], bg.inputs["Color"])
    links.new(bg.outputs["Background"], out.inputs["Surface"])
    return world


def add_camera(collection):
    """
    An architectural camera: level, long, and shifted rather than tilted.

    Tilting a camera up at a building converges its verticals, which is the
    first thing an architectural photographer corrects and the first thing a
    3D scene gets wrong. The camera here is dead level and the frame is moved
    with a lens shift, which is what a tilt-shift lens does on a real body.
    """
    cam = bpy.data.cameras.new("wce_camera")
    cam.sensor_width = 36.0
    cam.lens = 55.0
    cam.shift_y = 0.03
    cam.clip_start = 0.05
    cam.clip_end = 200.0

    obj = bpy.data.objects.new("wce_camera", cam)
    collection.objects.link(obj)
    # Six metres back, at eye height, onto the corner: far enough that the
    # whole sample and its return are in frame, close enough that a 7 in
    # exposure is still a course rather than a line.
    # The wall faces +Y, so the camera stands on the +Y side of it. Standing
    # on the other one photographs the sheathing.
    obj.location = (5.30, 4.30, 1.58)
    # x = 90 degrees is level; z turns it onto the corner.
    obj.rotation_euler = Euler((math.radians(90.0), 0.0, math.radians(142.0)), "XYZ")
    bpy.context.scene.camera = obj
    return obj


def add_ground(collection, mats):
    """A strip of ground, so the wall has something to stand on and bounce off."""
    obj = box("wce_ground", -8.0, 10.0, -6.0, 9.0, -0.02, 0.0, collection)
    assign(obj, mats["ground"])
    return obj


def configure_render(scene, args):
    engines = {i.identifier for i in scene.bl_rna.properties["engine"].enum_items} \
        if "engine" in scene.bl_rna.properties else set()

    wanted = args.engine.upper() if args.engine else "CYCLES"
    if wanted in engines or not engines:
        scene.render.engine = wanted
    else:
        fallback = next((e for e in ("CYCLES", "BLENDER_EEVEE_NEXT", "BLENDER_EEVEE") if e in engines), None)
        note(f"Render engine '{wanted}' is not available; using '{fallback}'. Available: {sorted(engines)}")
        if fallback:
            scene.render.engine = fallback

    scene.render.resolution_x, scene.render.resolution_y = args.res
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.film_transparent = False

    if scene.render.engine == "CYCLES":
        cy = scene.cycles
        cy.samples = 24 if args.preview else args.samples
        cy.use_denoising = True
        cy.max_bounces = 8
        cy.transmission_bounces = 8
        cy.caustics_reflective = False
        cy.caustics_refractive = False

    # AgX is the modern default and rolls the sunlit trim off without
    # clipping it. Older builds only have Filmic.
    view = scene.view_settings
    options = {i.identifier for i in view.bl_rna.properties["view_transform"].enum_items}
    for candidate in ("AgX", "Filmic", "Standard"):
        if candidate in options:
            view.view_transform = candidate
            break
    view.look = "None" if "None" in {i.identifier for i in view.bl_rna.properties["look"].enum_items} else view.look
    view.exposure = -0.25
    scene.display_settings.display_device = "sRGB"


# ---------------------------------------------------------------------------
# Export and verification
# ---------------------------------------------------------------------------

def _enable_gltf():
    for module in ("io_scene_gltf2", "bl_ext.blender_org.io_scene_gltf2"):
        try:
            bpy.ops.preferences.addon_enable(module=module)
            return True
        except Exception:
            continue
    return hasattr(bpy.ops.export_scene, "gltf")


def export_glb(path, objects):
    """Export the sample as a GLB, with the object names carried through."""
    if not _enable_gltf():
        note("The glTF exporter could not be enabled; no GLB was written.")
        return False

    for obj in bpy.context.scene.objects:
        obj.select_set(obj in objects)
    if objects:
        bpy.context.view_layer.objects.active = objects[0]

    try:
        bpy.ops.export_scene.gltf(
            filepath=path,
            export_format="GLB",
            use_selection=True,
            export_apply=True,        # bake the bevels in, or the GLB loses them
            export_yup=True,
            export_materials="EXPORT",
        )
    except TypeError as exc:
        note(f"export_scene.gltf rejected an argument on this build ({exc}); retrying minimally.")
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True)
    return os.path.exists(path)


def verify_glb(path):
    """
    Re-open the GLB in an empty file and read the names back.

    Exporting a file proves nothing; reading it back and finding the parts
    still called what they were called is the actual pipeline proof.
    """
    if not os.path.exists(path):
        return []
    try:
        bpy.ops.wm.read_homefile(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=path)
    except Exception as exc:
        note(f"The GLB could not be re-imported for verification: {exc}")
        return []
    return sorted(o.name for o in bpy.context.scene.objects if o.type == "MESH")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def parse_args(argv):
    p = argparse.ArgumentParser(prog="siding_sample.py", add_help=True)
    p.add_argument("--out", default="assets/blender/out", help="Directory for the .blend, .png and .glb")
    p.add_argument("--samples", type=int, default=160, help="Cycles samples for the final render")
    p.add_argument("--res", type=int, nargs=2, default=[1600, 1200], metavar=("W", "H"))
    p.add_argument("--engine", default="CYCLES")
    p.add_argument("--preview", action="store_true", help="Fast, noisy render while iterating")
    p.add_argument("--skip-render", action="store_true")
    p.add_argument("--colour", default="porcelain", choices=("porcelain", "navy", "sandstone"))
    # The daylight balance, exposed because it is the one thing worth
    # arguing about in front of a render rather than in a file.
    p.add_argument("--sun", type=float, default=SUN_ENERGY, help="Sun irradiance")
    p.add_argument("--sky", type=float, default=SKY_STRENGTH, help="Sky dome strength")
    return p.parse_args(argv)


SIDING_COLOURS = {
    # Linear-ish values for the three finishes the studio offers. Porcelain is
    # the default because a pale board shows the lap shadow, which is what
    # this sample is for.
    "porcelain": (0.560, 0.540, 0.505),
    "navy": (0.043, 0.072, 0.145),
    "sandstone": (0.420, 0.360, 0.270),
}


# ---------------------------------------------------------------------------
# Scene assembly
#
# Kept apart from main() so the live-reload runner (live_reload.py) can rebuild
# the sample inside an open Blender session without reloading the file,
# resetting the window layout, or writing anything to disk.
# ---------------------------------------------------------------------------

COLLECTION_NAME = "wce_siding_sample"
PREFIX = "wce"


def clear_scene(scene=None):
    """Remove a previous build of this sample, and nothing else.

    Only datablocks whose name starts with PREFIX are touched, so anything
    else in the open file survives a rebuild. That restraint is what makes the
    live-reload runner safe to point at a file somebody is working in.
    """
    scene = scene if scene is not None else bpy.context.scene

    removed = 0
    for collection in [c for c in bpy.data.collections if c.name.startswith(COLLECTION_NAME)]:
        for obj in list(collection.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
            removed += 1
        bpy.data.collections.remove(collection)

    # Objects of ours that were moved out of the collection by hand.
    for obj in [o for o in bpy.data.objects if o.name.startswith(PREFIX)]:
        bpy.data.objects.remove(obj, do_unlink=True)
        removed += 1

    if scene.world is not None and scene.world.name.startswith(PREFIX):
        scene.world = None

    # Sweep the datablocks the removed objects were using. Blender keeps
    # zero-user data until the file is saved, and build_world() and painted()
    # both make a new datablock every call, so without this a hundred reloads
    # leave a hundred wce_sky.NNN worlds behind.
    for store in (bpy.data.meshes, bpy.data.lights, bpy.data.cameras,
                  bpy.data.materials, bpy.data.worlds, bpy.data.node_groups):
        for block in [b for b in store if b.users == 0 and b.name.startswith(PREFIX)]:
            store.remove(block)

    return removed


def build_scene(colour="porcelain", sun=None, sky=None):
    """Build the sample into the current scene and return (collection, parts).

    Assumes the scene is already clear of a previous build; call clear_scene()
    first when rebuilding in place.
    """
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0

    collection = bpy.data.collections.new(COLLECTION_NAME)
    scene.collection.children.link(collection)

    mats = {
        "siding": painted("wce_siding_paint", SIDING_COLOURS[colour], 0.62, variation=0.06),
        "trim": painted("wce_trim_paint", (0.780, 0.765, 0.730), 0.42, variation=0.03),
        "sheathing": painted("wce_sheathing", (0.210, 0.150, 0.085), 0.88),
        "framing": painted("wce_framing", (0.330, 0.245, 0.130), 0.92),
        "interior": painted("wce_interior", (0.030, 0.034, 0.040), 0.80),
        "barrier": painted("wce_barrier", (0.330, 0.330, 0.320), 0.80),
        "ground": painted("wce_ground", (0.085, 0.120, 0.055), 0.95, variation=0.04),
        "glass": glass_material(),
    }

    parts = build_wall(
        "wce", WALL_LENGTH, collection, mats,
        window=((WALL_LENGTH - RO_WIDTH) / 2.0 + RO_WIDTH / 2.0, RO_SILL_Z, RO_WIDTH, RO_HEIGHT),
        stop_right=TRIM_FACE,
    )

    # The return wall is the same builder, turned a quarter turn about the
    # corner. One description of a wall, used twice.
    before = set(collection.objects)
    build_wall("wce_return", RETURN_LENGTH, collection, mats, stop_left=TRIM_THICKNESS + WRB)
    turned = [o for o in collection.objects if o not in before]
    pivot = Matrix.Translation((WALL_LENGTH + TRIM_THICKNESS + WRB, 0.0, 0.0)) @ \
        Matrix.Rotation(math.radians(-90.0), 4, "Z")
    for obj in turned:
        obj.matrix_world = pivot @ obj.matrix_world
    parts.extend(turned)

    parts.extend(build_corner(collection, mats))
    add_ground(collection, mats)
    add_sun(collection, sun)
    add_camera(collection)
    build_world(sky)
    return collection, parts


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    args = parse_args(argv)

    out_dir = os.path.abspath(args.out)
    os.makedirs(out_dir, exist_ok=True)

    bpy.ops.wm.read_homefile(use_empty=True)
    scene = bpy.context.scene
    collection, parts = build_scene(colour=args.colour, sun=args.sun, sky=args.sky)
    configure_render(scene, args)

    tri_estimate = sum(len(o.data.polygons) for o in parts if o.type == "MESH")
    note(f"Built {len(parts)} named parts, {tri_estimate} faces before modifiers.")

    blend_path = os.path.join(out_dir, "wce_siding_sample.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    note(f"Saved {blend_path}")

    png_path = os.path.join(out_dir, "wce_siding_sample.png")
    if args.skip_render:
        note("Render skipped at the caller's request.")
    else:
        scene.render.filepath = png_path
        bpy.ops.render.render(write_still=True)
        note(f"Rendered {png_path} at {args.res[0]}x{args.res[1]} on {scene.render.engine}")

    glb_path = os.path.join(out_dir, "wce_siding_sample.glb")
    exported = export_glb(glb_path, [o for o in parts if o.type == "MESH"])
    if exported:
        note(f"Exported {glb_path} ({os.path.getsize(glb_path)} bytes)")

    names = verify_glb(glb_path) if exported else []
    if names:
        note(f"Re-imported the GLB and found {len(names)} named meshes, first five: {names[:5]}")

    report = os.path.join(out_dir, "report.txt")
    with open(report, "w", encoding="utf-8") as fh:
        fh.write("Windy City Exteriors — Blender siding sample\n")
        fh.write(f"Blender {bpy.app.version_string}\n\n")
        for line in NOTES:
            fh.write(line + "\n")
        if names:
            fh.write("\nMeshes in the GLB:\n")
            for n in names:
                fh.write(f"  {n}\n")
    print(f"[wce] Report written to {report}")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        sys.exit(1)
