
var FPS = function() {
    this.last_sec = -1;
    this.count_fps = 0;
    this.show_fps = -1;

    this.domElement = document.createElement("div");
    this.domElement.style.position = "absolute";
    this.domElement.style.top = "0";
    this.domElement.style.left = "0";
    this.domElement.style.fontWeight = "bold";
    this.domElement.style.backgroundColor = "#ffffff";
    this.domElement.style.display = "none";
};

FPS.prototype.show = function() {
    this.domElement.style.display = "block";
};

FPS.prototype.hide = function() {
    this.domElement.style.display = "none";
};

FPS.prototype.set_display = function(display) {
    if (display)
        this.show();
    else
        this.hide();
};

FPS.prototype.toggle_display = function() {
    this.set_display(this.domElement.style.display != "block");
};

FPS.prototype.update = function() {
    var cur_sec = Math.floor(Date.now() / 1000);
    if (this.last_sec != cur_sec) {
        this.show_fps = this.count_fps;
        this.count_fps = 0;
        this.last_sec = cur_sec;
        this.domElement.innerHTML = this.show_fps + " fps";
    }
    this.count_fps++;
};
