/* stereo_three.js - a simple single image stereogram renderer using Three.js
   Copyright (C) 2014 Ricardo Massaro <ricardo.massaro@gmail.com>

This code uses Three.js to render a Single Image Stereogram from a
depth map given in the form of a texture (only the "red" component of
the texture is used).

The stereogram is rendered using either random noise (a "seed" can be
set, so it's possible to vary the noise in an animation) or a tiled
texture (the start position can be set, so it's possible to "scroll"
the background).

The depth map texture can be any size, but will be stretched to cover
the whole viewport. The background tiled texture, if given, must be
have power of 2 dimensions (so it can be tiled).


Example:

   var width = 800;
   var height = 450;

   // setup a Three.js renderer as usual
   var renderer = new THREE.WebGLRenderer();
   renderer.setSize(width, height);
   document.body.appendChild(renderer.domElement);

   // create the stereogram renderer
   var stereo = new Stereogram.Renderer(width, height);

   // OPTIONAL: set background texture (NOTE: the dimensions of this texture must be powers of 2)
   var tile_texture = THREE.ImageUtils.loadTexture("textures/tile.png");
   tile_texture.wrapS = THREE.RepeatWrapping;
   tile_texture.wrapT = THREE.RepeatWrapping;
   stereo.setBackgroundMode(Stereogram.BG_TILE);
   stereo.setBackgroundTileTexture(tile_texture);
   stereo.setBackgroundTileScroll(0.5, 0.5);

   // load depth map texture (this can have any size)
   var depth_map = THREE.ImageUtils.loadTexture("textures/depth_map.png");

   // render the stereogram
   function render() {
     requestAnimationFrame(render);
     stereo.render(renderer, depth_map);
   };
   render();
*/

var Stereogram = {
    BG_NOISE : 0,
    BG_TILE : 1,
};

/**
 * Create a new Stereogram renderer
 */
Stereogram.Renderer = function(width, height) {
    this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, 1, 100);
    this.camera.position.z = 1;
    xx = this.camera;

    this.resize(width, height);
    this.setNumStrips(-1);
    this.setNumSubStrips(2);
    this.setDepthFactor(1/75);

    this.setBackgroundMode(Stereogram.BG_NOISE);
    this.setNoiseSeed(0);
    this.setBackgroundTileTexture(null);
    this.setBackgroundTileScroll(0, 0);

    this.background_mode = Stereogram.BG_NOISE;
    this.texture_material = new THREE.MeshBasicMaterial();
    this.noise_material = this.create_noise_material();

    this.tile_scene = new THREE.Scene();
    this.tile_material = this.texture_material;
    this.tile_strip = null;

    this.stereo_scene = new THREE.Scene();
    this.stereo_material = this.create_stereo_material();
    this.stereo_strip = null;
    
    // reference strip (flat)
    var geometry = new THREE.PlaneBufferGeometry(1, 1);
    this.tile_strip = new THREE.Mesh(geometry, this.texture_material);
    this.tile_scene.add(this.tile_strip);
    this.tile_scene.overrideMaterial = this.noise_material;

    // stereogram strip
    var geometry = new THREE.PlaneBufferGeometry(1, 1);
    this.stereo_strip = new THREE.Mesh(geometry, this.stereo_material);
    this.stereo_scene.add(this.stereo_strip);
};

Stereogram.Renderer.prototype.create_stereo_material = function() {
    var vertex_shader = [
        "attribute vec3 position;",
        "attribute vec2 uv;",
        "",
        "uniform mat4 modelViewMatrix;",
        "uniform mat4 projectionMatrix;",
        "",
        "varying highp vec2 frag_uv;",
        "",
        "void main(void) {",
        "  frag_uv = uv;",
        "  gl_Position = (projectionMatrix * modelViewMatrix) * vec4(position, 1.0);",
        "}"
    ].join("\n");

    var fragment_shader = [
        "uniform sampler2D depth_texture;",
        "uniform sampler2D stereo_texture;",
        "uniform highp float depth_factor;",
        "uniform highp float strip_size;",
        "uniform highp float depth_strip_size;",
        "",
        "varying highp vec2 frag_uv;",
        "",
        "void main(void) {",
        "  highp vec2 depth_uv = vec2((frag_uv.x / depth_strip_size - 1.0) * strip_size, frag_uv.y);",
        "  highp vec4 depth = texture2D(depth_texture, depth_uv);",
        "  highp float delta = depth.r * depth_factor;",
        "  ",
        "  highp vec2 uv = vec2(frag_uv.x + delta - strip_size, frag_uv.y);",
        "  gl_FragColor = texture2D(stereo_texture, uv);",
        "}"
    ].join("\n");

    return new THREE.RawShaderMaterial({
	attributes: {
	},
        uniforms: {
                strip_size : { type: "f", value: 0 },
                depth_strip_size : { type: "f", value: 0 },
                depth_factor : { type: "f", value: 0 },
                depth_texture : { type: "t", value: undefined },
                stereo_texture : { type: "t", value: undefined }
	},
	vertexShader: vertex_shader,
	fragmentShader: fragment_shader
    });
};

Stereogram.Renderer.prototype.create_noise_material = function() {
    var vertex_shader = [
        "attribute vec3 position;",
        "attribute vec2 uv;",
        "",
        "uniform mat4 modelViewMatrix;",
        "uniform mat4 projectionMatrix;",
        "",
        "varying highp vec2 frag_uv;",
        "",
        "void main(void) {",
        "  frag_uv = uv;",
        "  gl_Position = (projectionMatrix * modelViewMatrix) * vec4(position, 1.0);",
        "}"
    ].join("\n");

    var fragment_shader = [
        "uniform highp float seed;",
        "varying highp vec2 frag_uv;",
        "",
        "precision highp float;",
        "",
        "float rand(vec2 uv) {",
        "    return fract(sin(dot(uv, vec2(12.9898,78.233))) * (43758.5453 + seed));",
        "}",
        "",
        "void main(void) {",
        //"  highp vec2 uv = frag_uv - mod(frag_uv, vec2(0.005, 0.005));",
        //"  highp vec2 uv = mod(frag_uv, vec2(0.00004, 0.000002));",
        //"  highp vec2 uv = mod(frag_uv/7.0, vec2(0.05, 0.05));",
        "  float val = rand(frag_uv);",
        "  gl_FragColor = vec4(val, val, val, 1.0);",
        //"  gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);",
        "}"
    ].join("\n");

    return new THREE.RawShaderMaterial({
	attributes: {
	},
        uniforms: {
            seed : { type : "f", value : 0 },
            strip_size : { type: "f", value: 0 },
            depth_strip_size : { type: "f", value: 0 },
            depth_factor : { type: "f", value: 0 },
            depth_texture : { type: "t", value: undefined },
            stereo_texture : { type: "t", value: undefined }
	},
	vertexShader: vertex_shader,
	fragmentShader: fragment_shader
    });
};

/**
 * Set the rendering size.
 *
 * This size should be exactly the size of the framebuffer.
 */
Stereogram.Renderer.prototype.resize = function(width, height) {
    this.render_width = width;
    this.render_height = height;

    if (this.stereo_texture)
        this.stereo_texture.dispose();
    this.stereo_texture = new THREE.ImageUtils.generateDataTexture(width, height, { r:0, g:0, b:0 });
    this.stereo_texture.generateMipMaps = false;
    this.stereo_texture.minFilter = THREE.LinearFilter;
};

/**
 * Calculate the strip size.
 *
 * This ensures that the strips are pixel-aligned (i.e., each strip
 * and sub-strip contains an integer number of pixels).
 */
Stereogram.Renderer.prototype._calc_strip_size = function() {
    var render_width = this.render_width || 1;
    var num_strips = this.num_strips || 1;
    var num_sub_strips = this.num_sub_strips || 1;

    var strip_size_pixels = Math.ceil(render_width / num_strips);
    while (strip_size_pixels % num_sub_strips != 0)
        strip_size_pixels++;
    this.strip_size = strip_size_pixels / render_width;
};

/**
 * Set the number of strips to be rendered.
 *
 * If the value given is negative, an appropriate value is picked
 * based on the render size.
 *
 * Increasing this value slows the rendering.
 */
Stereogram.Renderer.prototype.setNumStrips = function(num_strips) {
    if (num_strips < 0)
        num_strips = Math.ceil(8 * this.render_width / 1000);
    this.num_strips = num_strips;
    this._calc_strip_size();
};

/**
 * Set the number of sub strips to be rendered.
 *
 * At least 2 is recommended (larger values may be necessary depending
 * on the depth map).
 *
 * Increasing this value slows the rendering.
 */
Stereogram.Renderer.prototype.setNumSubStrips = function(num_sub_strips) {
    this.num_sub_strips = num_sub_strips;
    this._calc_strip_size();
};

/**
 * Set the background mode for the stereogram.
 *
 * - 'mode' must be either Stereogram.BG_NOISE or Stereogram.BG_TILE
 *
 * If 'mode' is Stereogram.BG_TILE, setBackgroundTileTexture() must be
 * called to set thebackground texture. 
 */
Stereogram.Renderer.prototype.setBackgroundMode = function(mode) {
    this.background_mode = (mode == Stereogram.BG_NOISE) ? Stereogram.BG_NOISE : Stereogram.BG_TILE;
}

/**
 * Set the texture for the background tile.
 *
 * The texture dimensions must be powers of 2.
 */
Stereogram.Renderer.prototype.setBackgroundTileTexture = function(texture) {
    this.tile_texture = texture;
}

/**
 * Set the background tile scroll offset.
 *
 * The values must be between 0 and 1; the defaults are 0.
 */
Stereogram.Renderer.prototype.setBackgroundTileScroll = function(x, y) {
    this.bg_scroll_x = x;
    this.bg_scroll_y = y;
};

/**
 * Set the random seed of the background texture generated noise.
 * 
 * The default value is 0.
 */
Stereogram.Renderer.prototype.setNoiseSeed = function(seed) {
    this.noise_seed = seed;
};

/**
 * Set the depth factor.
 *
 * Larger values cause the stereogram to "pop out" more.
 * Experimentation suggests the value should be between 1/50 and 1/100.
 */
Stereogram.Renderer.prototype.setDepthFactor = function(depth_factor) {
    this.depth_factor = depth_factor;
};

/**
 * Render the stereogram given a tile texture and a depth map texture
 */
Stereogram.Renderer.prototype.render = function(renderer, depth_map) {
    // render reference strip
    this._render_reference_strip(renderer, this.strip_size);

    // render stereogram strips
    this.stereo_material.uniforms.strip_size.value = this.strip_size;
    this.stereo_material.uniforms.depth_strip_size.value = 1/(this.num_strips+1);
    this.stereo_material.uniforms.depth_factor.value = this.depth_factor;
    this.stereo_material.uniforms.depth_texture.value = depth_map;
    this.stereo_material.uniforms.stereo_texture.value = this.stereo_texture;
    renderer.autoClear = false;
    for (var strip = 1; strip < this.num_strips; strip++)
        for (var sub = 0; sub < this.num_sub_strips; sub++)
            this._render_stereo_strip(renderer, this.num_sub_strips * strip + sub, this.strip_size/this.num_sub_strips);
    renderer.autoClear = true;
};

/**
 * Render the reference strip (flat tiles with no depth) to the leftmost part of the screen
 *
 * - 'strip_size' must be between 0 and 1
 */
Stereogram.Renderer.prototype._render_reference_strip = function(renderer, strip_size) {
    var bg_scroll_x, bg_scroll_y;

    if (this.background_mode == Stereogram.BG_NOISE) {
        bg_scroll_x = bg_scroll_y = 0;
        this.noise_material.uniforms.seed.value = this.noise_seed;
        this.tile_scene.overrideMaterial = this.noise_material;
    } else {
        bg_scroll_x = this.bg_scroll_x;
        bg_scroll_y = this.bg_scroll_y;
        this.tile_material.map = this.tile_texture;
        this.tile_scene.overrideMaterial = this.tile_material;
    }

    // set strip position
    this.tile_strip.position.x = 0.5 * strip_size;
    this.tile_strip.position.y = 0.5;
    this.tile_strip.scale.x = strip_size;
    this.tile_strip.scale.y = 1;

    // set strip texture coords
    this.tile_strip.geometry.attributes.uv.array[0] = bg_scroll_x;
    this.tile_strip.geometry.attributes.uv.array[1] = bg_scroll_y + 1/strip_size;
    this.tile_strip.geometry.attributes.uv.array[2] = bg_scroll_x + 1;
    this.tile_strip.geometry.attributes.uv.array[3] = bg_scroll_y + 1/strip_size;
    this.tile_strip.geometry.attributes.uv.array[4] = bg_scroll_x;
    this.tile_strip.geometry.attributes.uv.array[5] = bg_scroll_y;
    this.tile_strip.geometry.attributes.uv.array[6] = bg_scroll_x + 1;
    this.tile_strip.geometry.attributes.uv.array[7] = bg_scroll_y;
    this.tile_strip.geometry.attributes.uv.needsUpdate = true;
    
    // render strip and copy it back to stereogram texture
    renderer.render(this.tile_scene, this.camera);
    this._copy_strip_to_stereo_texture(renderer, 0, Math.floor(strip_size*this.render_width) + this.num_sub_strips);
}

/**
 * Render stereogram strip based on the strip to the left
 *
 * - 'num' is the strip number (from 1 to the number of strips - 1)
 * - 'strip_size' must be between 0 and 1
 */
Stereogram.Renderer.prototype._render_stereo_strip = function(renderer, num, strip_size) {
    // set strip position
    this.stereo_strip.position.x = (num+0.5) * strip_size;
    this.stereo_strip.position.y = 0.5;
    this.stereo_strip.scale.x = strip_size;
    this.stereo_strip.scale.y = 1;

    // set strip texture coords
    this.stereo_strip.geometry.attributes.uv.array[0] = num * strip_size;
    this.stereo_strip.geometry.attributes.uv.array[1] = 1;
    this.stereo_strip.geometry.attributes.uv.array[2] = (num+1) * strip_size;
    this.stereo_strip.geometry.attributes.uv.array[3] = 1;
    this.stereo_strip.geometry.attributes.uv.array[4] = num * strip_size;
    this.stereo_strip.geometry.attributes.uv.array[5] = 0;
    this.stereo_strip.geometry.attributes.uv.array[6] = (num+1) * strip_size;
    this.stereo_strip.geometry.attributes.uv.array[7] = 0;
    this.stereo_strip.geometry.attributes.uv.needsUpdate = true;

    // render strip and copy it back to stereogram texture
    renderer.render(this.stereo_scene, this.camera);
    this._copy_strip_to_stereo_texture(renderer, Math.floor(num*strip_size*this.render_width), Math.floor(strip_size*this.render_width) + this.num_sub_strips);
}

/**
 * Copy a strip from the framebuffer to the stereogram texture
 */
Stereogram.Renderer.prototype._copy_strip_to_stereo_texture = function(renderer, x, width) {
    if (width > this.render_width - x)
        width = this.render_width - x;

    var gl = renderer.getContext();

    renderer.setTexture(this.stereo_texture, 0);
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, x, 0, x, 0, width, this.render_height);
    //gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGB, 0, 0, this.render_width, this.render_height, 0);
}
