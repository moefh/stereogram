
var KEY_UP = 38;
var KEY_DOWN = 40;
var KEY_LEFT = 37;
var KEY_RIGHT = 39;

var Keyboard = function() {
    this.handlers = {};
    this.registered = false;
    this.key = {};
    this.pressed = {};

    // create KEY_* globals for each letter
    for (var i = 0; i < 26; i++)
        window['KEY_' + String.fromCharCode(65+i)] = 65+i;
};

Keyboard.prototype.reset = function() {
    for (var k in this.pressed)
        delete this.pressed[k];
};

Keyboard.prototype.register = function() {
    var self = this;
    
    if (this.registered)
        return;

    this.handlers = {
        keydown : function(ev) {
            //console.log("KEY_DOWN:", ev.keyCode);
            if (ev.keyCode) {
                self.key[ev.keyCode] = true;
                self.pressed[ev.keyCode] = true;
            }
        },
        
        keyup : function(ev) {
            //console.log("KEY_UP:", ev.keyCode);
            if (ev.keyCode)
                self.key[ev.keyCode] = false;
        }
    };

    for (var ev_name in this.handlers)
        document.addEventListener(ev_name, this.handlers[ev_name]);
    this.registered = true;
};

Keyboard.prototype.unregister = function() {
    if (! this.registered)
        return;

    for (var ev_name in this.handlers)
        document.removeEventListener(ev_name, this.handlers[ev_name]);
};