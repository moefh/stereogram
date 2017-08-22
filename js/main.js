
var stop_running = false;

var num_strips;
var num_sub_strips;
var depth_factor = 1/50;

var show_fps = false;
var show_stereogram = true;
var show_noise = false;
var animate_scene = false;
var scroll_background = false;
var time = 0;
var bg_scroll = 0;

var keyboard = null;
var render_width;
var render_height;
var renderer;
var fps;

var stereogram;
var camera;
var scene;
var depth_map;
var cube;

function init() {
    init_renderer();

    // keyboard input
    keyboard = new Keyboard();
    keyboard.register();
    stereogram = new Stereogram.Renderer(render_width, render_height);

    // load tile texture
    var tex_loader = new THREE.TextureLoader();
    tex_loader.load("textures/tile.png", function(tex) {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        stereogram.setBackgroundTileTexture(tex);

        init_scene();
    });
}

/**
 * Create renderer and add to DOM
 */
function init_renderer() {
    renderer = new THREE.WebGLRenderer();
    //window.addEventListener('resize', resize_window, false);
    set_render_size(1280, 720);

    fps = new FPS(container);

    // add stuff to DOM
    //var container = document.body;
    var container = document.getElementById("content");
    container.appendChild(fps.domElement);
    container.appendChild(renderer.domElement);
}

/**
 * Set the rendering size
 */
function set_render_size(w, h) {
    if (isNaN(w) || isNaN(h) || w <= 100 || h <= 100)
        return;

    render_width = w;
    render_height = h;
    render_width -= render_width % 4;
    render_height -= render_height % 4;

    // adjust renderer size and camera
    renderer.setSize(render_width, render_height);
    if (camera) {
        camera.aspect = render_width / render_height;
        camera.updateProjectionMatrix();
    }

    // rebuild depth map render target
    if (depth_map)
        depth_map.dispose();
    depth_map = new THREE.WebGLRenderTarget(render_width, render_height,
                                            {
                                                minFilter: THREE.LinearFilter,
                                                magFilter: THREE.NearestFilter,
                                                format: THREE.RGBFormat
                                            });

    // resize stereogram renderer
    if (stereogram) {
        stereogram.resize(render_width, render_height);
        stereogram.setNumStrips(-1);
    }
}

/**
 * Initialize 3D scene and begin animation
 */
function init_scene() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, render_width / render_height, 0.1, 10);
    camera.position.z = 5;

    var material = new THREE.RawShaderMaterial({
        vertexShader : document.getElementById('vertexshader').textContent,
        fragmentShader : document.getElementById('fragmentshader').textContent
    });

    var geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
    cube = new THREE.Mesh(geometry, material);
    scene.add(cube);
    cube.rotation.x = 0.78;
    cube.rotation.y = 0.78;
    
    // start animation
    animate();
}


function abort() {
    stop_running = true;
}

function animate() {
    if (stop_running)
        return;

    requestAnimationFrame(animate);
    process_keyboard();
    render();
    fps.update();
}

function process_keyboard() {
    if (keyboard.pressed[KEY_A])
        animate_scene = ! animate_scene;

    if (keyboard.pressed[KEY_S])
        show_stereogram = ! show_stereogram;

    if (keyboard.pressed[KEY_B])
        scroll_background = ! scroll_background;

    if (keyboard.pressed[KEY_T])
        show_noise = ! show_noise;

    if (keyboard.pressed[KEY_F]) {
        show_fps = ! show_fps;
        fps.set_display(show_fps);
    }

    keyboard.reset();
}

function render() {
    // render 3D scene
    render_3d_scene();

    // render stereogram from depth map
    if (show_stereogram) {
        if (scroll_background) {
            bg_scroll++;
            var scroll_amount = bg_scroll/500;
            scroll_amount -= Math.floor(scroll_amount);
            stereogram.setBackgroundTileScroll(scroll_amount, scroll_amount*2);
            stereogram.setNoiseSeed(100 * Math.random());
        }
        stereogram.setBackgroundMode((show_noise) ? Stereogram.BG_NOISE : Stereogram.BG_SCROLL)
        stereogram.render(renderer, depth_map);
    }
}

/**
 * Render the 3D scene.
 *
 * The scene is rendered with the 'depth_material', which renders a
 * depth map instead of colors.
 */
function render_3d_scene() {
    if (animate_scene) {
        time++;
        cube.rotation.x += 0.005;
        cube.rotation.y += 0.005;
    }
    cube.position.x = Math.sin(time / 200 * Math.PI);
    cube.position.y = Math.cos(time / 200 * Math.PI);

    // if showing stereogram, render to depth map texture; otherwise, render to screen
    if (show_stereogram)
        renderer.render(scene, camera, depth_map);
    else
        renderer.render(scene, camera);
}
