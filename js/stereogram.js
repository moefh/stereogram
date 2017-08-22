/* stereogram.js - a simple single image stereogram renderer
   Copyright (C) 2014 Ricardo Massaro <ricardo.massaro@gmail.com>

This code uses plain WebGL to render a Single Image Stereogram from a
depth map given in the form of an image (only the "red" component of
the texture is used, but usually a grayscale image is given).

The stereogram is rendered using either random noise (a "seed" can be
set, so it's possible to vary the noise in an animation) or a tiled
texture (the start position can be set, so it's possible to "scroll"
the background).

The depth map texture can be any size, but will be stretched to cover
the whole viewport. The background tiled texture, if given, must be
have power of 2 dimensions (so it can be tiled).


Example:

   // get canvas and WebGL context
   var canvas = document.getElementById('canvas3d');
   var gl = canvas.getContext("webgl");
   if (! gl)
     alert("Error initializing WebGL");

   // create the stereogram renderer
   var stereo = new Stereogram.Renderer(gl, canvas.width, canvas.height);

   // load depth map texture (this can have any size)
   var depth_map = Stereogram.Util.load_texture(gl, "textures/depth_map.png");

   // OPTIONAL: set background texture (NOTE: the dimensions of this texture must be powers of 2)
   var tile = Stereogram.Util.load_texture(gl, "textures/tile.png");
   stereo.setBackgroundTileTexture(tile);
   stereo.setBackgroundMode(Stereogram.BG_TILE);
   stereo.setBackgroundTileScroll(0.5, 0.5);

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

    modelview : new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
    ]),
    projection : new Float32Array([
         2, 0, 0, 0,
         0, 2, 0, 0,
         0, 0, 1, 0,
        -1,-1, 0, 1
    ]),

    quad_vtx : [
        0,0,0,
        1,0,0,
        1,1,0,
        1,1,0,
        0,1,0,
        0,0,0
    ],

    quad_uv : [
        0,0,
        1,0,
        1,1,
        1,1,
        0,1,
        0,0
    ]
};

/* =============================================================================================== */
/* === Util ====================================================================================== */
/* =============================================================================================== */

Stereogram.Util = {

    create_shader : function(gl, type, source) {
        var shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (! gl.getShaderParameter(shader, gl.COMPILE_STATUS))
            throw "error in shader: " + gl.getShaderInfoLog(shader);
        return shader;
    },

    create_program_shader : function(gl, vtx_source, frag_source, attributes, uniforms) {
        var vtx_shader = Stereogram.Util.create_shader(gl, gl.VERTEX_SHADER, vtx_source);
        if (vtx_shader == null)
            return null;
        var frag_shader = Stereogram.Util.create_shader(gl, gl.FRAGMENT_SHADER, frag_source);
        if (frag_shader == null)
            return null;
        
        var prog = gl.createProgram();
        gl.attachShader(prog, vtx_shader);
        gl.attachShader(prog, frag_shader);
        gl.linkProgram(prog);
        if (! gl.getProgramParameter(prog, gl.LINK_STATUS))
            throw "error in shader program: " + gl.getProgramInfoLog(prog);
        
        for (var attr_name in attributes) {
            var attr = attributes[attr_name];
            
            attr.webgl_buf = gl.createBuffer();
            attr.needsUpdate = true;
        }
        
        return {
            attributes : attributes,
            uniforms : uniforms,
            webgl_program : prog
        };
    },

    enable_program_shader : function(gl, prog) {
        gl.useProgram(prog.webgl_program);
        
        // update attributes
        var enabled_attrs = [];
        for (var attr_name in prog.attributes) {
            var attr = prog.attributes[attr_name];
            var attr_pos = gl.getAttribLocation(prog.webgl_program, attr_name);
            enabled_attrs[attr_pos] = true;
            
            gl.bindBuffer(gl.ARRAY_BUFFER, attr.webgl_buf);
            if (! attr.array) {
                attr.array = new Float32Array(attr.value);
                attr.needsUpdate = true;
            }
            if (attr.needsUpdate) {
	        gl.bufferData(gl.ARRAY_BUFFER, attr.array, gl.DYNAMIC_DRAW);
                attr.needsUpdate = false;
            }
            gl.enableVertexAttribArray(attr_pos);
            switch (attr.type) {
            case 'f':  gl.vertexAttribPointer(attr_pos, 1, gl.FLOAT, false, 0, 0); break;
            case 'v2': gl.vertexAttribPointer(attr_pos, 2, gl.FLOAT, false, 0, 0); break;
            case 'v3': gl.vertexAttribPointer(attr_pos, 3, gl.FLOAT, false, 0, 0); break;
            case 'v4': gl.vertexAttribPointer(attr_pos, 4, gl.FLOAT, false, 0, 0); break;
            default:
                throw "unknown attribute type: '" + attr.type + "'";
            }
        }
        for (var i = 0; i < gl.getParameter(gl.MAX_VERTEX_ATTRIBS); i++)
            if (! enabled_attrs[i])
                gl.disableVertexAttribArray(i);
        
        // update uniforms
        var tex_num = 0;
        for (var uniform_name in prog.uniforms) {
            var uniform = prog.uniforms[uniform_name];
            var uniform_pos = gl.getUniformLocation(prog.webgl_program, uniform_name);
            switch (uniform.type) {
            case 'f':
                gl.uniform1f(uniform_pos, uniform.value);
                break;
                
            case 't':
                gl.activeTexture(gl.TEXTURE0 + tex_num);
                gl.bindTexture(gl.TEXTURE_2D, uniform.value);
                gl.uniform1i(uniform_pos, tex_num);
                tex_num++;
                break;
                
            case 'm4':
                gl.uniformMatrix4fv(uniform_pos, false, uniform.value);
                break;

            default:
                throw "unknown uniform type: '" + uniform.type + "'";
            }
        }
    },

    create_texture : function(gl, width, height) {
        var texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, width, height, 0, gl.RGB, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);
        return texture;
    },

    is_power_of_two : function(n) {
        return (n != 0) && ((n & (n-1)) == 0);
    },

    load_texture : function(gl, url, on_load, on_error) {
        var texture = Stereogram.Util.create_texture(gl, 1, 1);

        var image = new Image();
        image.onload = function() {
            gl.bindTexture(gl.TEXTURE_2D, texture);
	    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

            if (Stereogram.Util.is_power_of_two(image.width) && Stereogram.Util.is_power_of_two(image.height)) {
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
                gl.generateMipmap(gl.TEXTURE_2D);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
            } else {
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            }
            gl.bindTexture(gl.TEXTURE_2D, null);

            if (on_load)
                on_load(texture);
        };
        image.onerror = function() {
            if (on_error)
                on_error();
        };
        image.src = url;

        return texture;
    }

};


/* =============================================================================================== */
/* === Renderer ================================================================================== */
/* =============================================================================================== */

/**
 * Create a new Stereogram renderer
 */
Stereogram.Renderer = function(gl, width, height) {
    this.gl = gl;
    this.resize(width, height);
    this.setNumStrips(-1);
    this.setNumSubStrips(2);
    this.setDepthFactor(1/75);

    this.setBackgroundMode(Stereogram.BG_NOISE);
    this.setNoiseSeed(0);
    this.setBackgroundTileTexture(null);
    this.setBackgroundTileScroll(0, 0);

    this.background_mode = Stereogram.BG_NOISE;
    this.noise_shader = this.create_noise_shader();
    this.texture_shader = this.create_texture_shader();
    this.tile_strip = null;

    this.stereo_shader = this.create_stereo_shader();
    this.stereo_strip = null;
};

Stereogram.Renderer.prototype.create_stereo_shader = function() {
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

    return Stereogram.Util.create_program_shader(this.gl,
                                                 vertex_shader,
                                                 fragment_shader,
                                                 {
                                                     position : { type: "v3", value:[] },
                                                     uv : { type: "v2", value:[] },
                                                 },
                                                 {
                                                     modelViewMatrix : { type: "m4", value:Stereogram.modelview },
                                                     projectionMatrix : { type: "m4", value:Stereogram.projection },
                                                     strip_size : { type: "f", value: 0 },
                                                     depth_strip_size : { type: "f", value: 0 },
                                                     depth_factor : { type: "f", value: 0 },
                                                     depth_texture : { type: "t", value: undefined },
                                                     stereo_texture : { type: "t", value: undefined }
	                                         });
};

Stereogram.Renderer.prototype.create_noise_shader = function() {
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
        "  float val = rand(frag_uv);",
        "  gl_FragColor = vec4(val, val, val, 1.0);",
        "}"
    ].join("\n");

    return Stereogram.Util.create_program_shader(this.gl,
                                                 vertex_shader,
                                                 fragment_shader,
                                                 {
                                                     position : { type: "v3", value:[] },
                                                     uv : { type: "v2", value:[] },
                                                 },
                                                 {
                                                     modelViewMatrix : { type: "m4", value:Stereogram.modelview },
                                                     projectionMatrix : { type: "m4", value:Stereogram.projection },
                                                     seed : { type : "f", value : 0 },
                                                     strip_size : { type: "f", value: 0 },
                                                     depth_strip_size : { type: "f", value: 0 },
                                                     depth_factor : { type: "f", value: 0 },
                                                     depth_texture : { type: "t", value: undefined },
                                                     stereo_texture : { type: "t", value: undefined }
	                                         });
};

Stereogram.Renderer.prototype.create_texture_shader = function() {
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
        "uniform sampler2D texture;",
        "",
        "varying highp vec2 frag_uv;",
        "",
        "void main(void) {",
        "  gl_FragColor = texture2D(texture, frag_uv);",
        "}"
    ].join("\n");

    return Stereogram.Util.create_program_shader(this.gl,
                                                 vertex_shader,
                                                 fragment_shader,
                                                 {
                                                     position : { type: "v3", value:[] },
                                                     uv : { type: "v2", value:[] },
                                                 },
                                                 {
                                                     modelViewMatrix : { type: "m4", value:Stereogram.modelview },
                                                     projectionMatrix : { type: "m4", value:Stereogram.projection },
                                                     texture : { type: "t", value: undefined }
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
        gl.deleteTexture(this.stereo_texture);
    this.stereo_texture = Stereogram.Util.create_texture(this.gl, width, height);
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
Stereogram.Renderer.prototype.render = function(depth_map) {
    var gl = this.gl;
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // render reference strip
    this._render_reference_strip(this.strip_size);

    // render stereogram strips
    this.stereo_shader.uniforms.strip_size.value = this.strip_size;
    this.stereo_shader.uniforms.depth_strip_size.value = 1/(this.num_strips+1);
    this.stereo_shader.uniforms.depth_factor.value = this.depth_factor;
    this.stereo_shader.uniforms.depth_texture.value = depth_map;
    this.stereo_shader.uniforms.stereo_texture.value = this.stereo_texture;
    for (var strip = 1; strip < this.num_strips; strip++)
        for (var sub = 0; sub < this.num_sub_strips; sub++)
            this._render_stereo_strip(this.num_sub_strips * strip + sub, this.strip_size/this.num_sub_strips);
};

/**
 * Render the reference strip (flat tiles with no depth) to the leftmost part of the screen
 *
 * - 'strip_size' must be between 0 and 1
 */
Stereogram.Renderer.prototype._render_reference_strip = function(strip_size) {
    var bg_scroll_x, bg_scroll_y;

    var use_shader;
    if (this.background_mode == Stereogram.BG_NOISE) {
        bg_scroll_x = bg_scroll_y = 0;
        this.noise_shader.uniforms.seed.value = this.noise_seed;
        use_shader = this.noise_shader;
    } else {
        bg_scroll_x = this.bg_scroll_x;
        bg_scroll_y = this.bg_scroll_y;
        this.texture_shader.uniforms.texture.value = this.tile_texture;
        use_shader = this.texture_shader;
    }

    // set strip position
    var pos = use_shader.attributes.position;
    var v = pos.array || pos.value;
    for (var i = 0; i < Stereogram.quad_vtx.length/3; i++) {
        v[3*i  ] = Stereogram.quad_vtx[3*i  ] * strip_size;
        v[3*i+1] = Stereogram.quad_vtx[3*i+1];
        v[3*i+2] = Stereogram.quad_vtx[3*i+2];
    }
    pos.needsUpdate = true;

    // set strip texture coords
    var uv = use_shader.attributes.uv;
    var v = uv.array || uv.value;
    for (var i = 0; i < Stereogram.quad_uv.length/2; i++) {
        v[2*i  ] = bg_scroll_x + Stereogram.quad_uv[2*i  ];
        v[2*i+1] = bg_scroll_y + Stereogram.quad_uv[2*i+1]/strip_size;
    }
    uv.needsUpdate = true;
    
    Stereogram.Util.enable_program_shader(this.gl, use_shader);

    // render strip and copy it back to stereogram texture
    this.gl.drawArrays(this.gl.TRIANGLES, 0, use_shader.attributes.position.array.length/3);
    this._copy_strip_to_stereo_texture(0, Math.floor(strip_size*this.render_width) + this.num_sub_strips);
}

/**
 * Render stereogram strip based on the strip to the left
 *
 * - 'num' is the strip number (from 1 to the number of strips - 1)
 * - 'strip_size' must be between 0 and 1
 */
Stereogram.Renderer.prototype._render_stereo_strip = function(num, strip_size) {
    // set strip position
    var pos = this.stereo_shader.attributes.position;
    var v = pos.array || pos.value;
    for (var i = 0; i < Stereogram.quad_vtx.length/3; i++) {
        v[3*i  ] = (Stereogram.quad_vtx[3*i  ] + num) * strip_size;
        v[3*i+1] =  Stereogram.quad_vtx[3*i+1];
        v[3*i+2] =  Stereogram.quad_vtx[3*i+2];
    }
    pos.needsUpdate = true;
    
    // set strip texture coords
    var uv = this.stereo_shader.attributes.uv;
    var v = uv.array || uv.value;
    for (var i = 0; i < Stereogram.quad_uv.length/2; i++) {
        v[2*i  ] = (Stereogram.quad_uv[2*i  ] + num) * strip_size;
        v[2*i+1] =  Stereogram.quad_uv[2*i+1];
    }
    uv.needsUpdate = true;
    
    Stereogram.Util.enable_program_shader(this.gl, this.stereo_shader);

    // render strip and copy it back to stereogram texture
    this.gl.drawArrays(this.gl.TRIANGLES, 0, this.stereo_shader.attributes.position.array.length/3);
    this._copy_strip_to_stereo_texture(Math.floor(num*strip_size*this.render_width), Math.floor(strip_size*this.render_width) + this.num_sub_strips);
}

/**
 * Copy a strip from the framebuffer to the stereogram texture
 */
Stereogram.Renderer.prototype._copy_strip_to_stereo_texture = function(x, width) {
    var gl = this.gl;

    if (width > this.render_width - x)
        width = this.render_width - x;

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.stereo_texture);
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, x, 0, x, 0, width, this.render_height);
    //gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGB, 0, 0, this.render_width, this.render_height, 0);
}
